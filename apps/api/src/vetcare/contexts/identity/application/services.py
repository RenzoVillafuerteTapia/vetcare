"""Casos de uso de Identity & Access.

Cada método abre una unidad de trabajo, aplica las reglas del dominio, registra la auditoría en
la misma transacción y confirma. Los correos se envían después de confirmar.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from vetcare.contexts.identity.application.ports import (
    AccessToken,
    AccessTokenService,
    EmailSender,
    IdentityUnitOfWork,
    PasswordHasher,
)
from vetcare.contexts.identity.application.secret_tokens import generate_token, hash_token
from vetcare.contexts.identity.domain.audit import AuditAction, AuditEntry
from vetcare.contexts.identity.domain.model import Email, LockoutPolicy, UserAccount, UserStatus
from vetcare.contexts.identity.domain.password_policy import validate_password
from vetcare.contexts.identity.domain.permissions import Permission, Role
from vetcare.contexts.identity.domain.tokens import (
    InvalidTokenError,
    OneTimeToken,
    RefreshTokenFamily,
    RevocationReason,
    TokenPurpose,
)
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationFailedError,
)
from vetcare.shared_kernel.ids import new_id

logger = logging.getLogger(__name__)

INVALID_CREDENTIALS = "Correo o contraseña incorrectos."


@dataclass(frozen=True)
class SessionTokens:
    access: AccessToken
    refresh_token: str


@dataclass(frozen=True)
class RequestContext:
    ip_address: str | None = None


@dataclass(frozen=True)
class EmailLinks:
    """Arma los enlaces de los correos. El token va en el fragmento (#) para que no llegue a
    los registros de los servidores web."""

    web_base_url: str

    def invitation(self, token: str) -> str:
        return f"{self.web_base_url}/activar-cuenta#token={token}"

    def password_reset(self, token: str) -> str:
        return f"{self.web_base_url}/restablecer-contrasena#token={token}"


class IdentityService:
    def __init__(
        self,
        *,
        uow_factory: Callable[[], IdentityUnitOfWork],
        hasher: PasswordHasher,
        access_tokens: AccessTokenService,
        email: EmailSender,
        links: EmailLinks,
        clock: Clock,
        lockout: LockoutPolicy | None = None,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = hasher
        self._access_tokens = access_tokens
        self._email = email
        self._links = links
        self._clock = clock
        self._lockout = lockout or LockoutPolicy()

    # --- Sesiones -------------------------------------------------------------------------

    async def login(self, email: str, password: str, ctx: RequestContext) -> SessionTokens:
        now = self._clock.now()
        try:
            address = Email(email)
        except ValidationFailedError:
            self._hasher.verify_dummy(password)
            raise AuthenticationError(INVALID_CREDENTIALS) from None

        async with self._uow_factory() as uow:
            user = await uow.users.get_by_email(address)
            if user is None or user.password_hash is None:
                self._hasher.verify_dummy(password)
                await self._audit(uow, AuditAction.LOGIN_FAILED, None, ctx, reason="unknown")
                await uow.commit()
                raise AuthenticationError(INVALID_CREDENTIALS)

            if not user.can_log_in(now):
                # Mismo mensaje que una contraseña errónea: no revela si la cuenta existe,
                # está bloqueada o deshabilitada.
                self._hasher.verify_dummy(password)
                await self._audit(
                    uow, AuditAction.LOGIN_FAILED, user.id, ctx, user, reason=user.status.value
                )
                await uow.commit()
                raise AuthenticationError(INVALID_CREDENTIALS)

            if not self._hasher.verify(user.password_hash, password):
                was_locked = user.is_locked(now)
                user.record_failed_login(now, self._lockout)
                await uow.users.save(user)
                uow.track(user)
                await self._audit(uow, AuditAction.LOGIN_FAILED, user.id, ctx, user)
                if user.is_locked(now) and not was_locked:
                    await self._audit(uow, AuditAction.ACCOUNT_LOCKED, user.id, ctx, user)
                await uow.commit()
                raise AuthenticationError(INVALID_CREDENTIALS)

            if self._hasher.needs_rehash(user.password_hash):
                user.password_hash = self._hasher.hash(password)
            user.record_successful_login(now)
            await uow.users.save(user)
            refresh = generate_token()
            await uow.refresh_tokens.add(
                RefreshTokenFamily.start(
                    id=new_id(), user_id=user.id, token_hash=hash_token(refresh), now=now
                )
            )
            await self._audit(uow, AuditAction.LOGIN_SUCCEEDED, user.id, ctx, user)
            await uow.commit()
            return SessionTokens(self._access_tokens.issue(user, now), refresh)

    async def refresh(self, refresh_token: str, ctx: RequestContext) -> SessionTokens:
        now = self._clock.now()
        presented = hash_token(refresh_token)
        async with self._uow_factory() as uow:
            family = await uow.refresh_tokens.get_by_current_hash(presented)
            if family is None:
                reused = await uow.refresh_tokens.get_by_retired_hash(presented)
                if reused is not None and reused.revoked_at is None:
                    reused.revoke(RevocationReason.REUSE_DETECTED, now)
                    await uow.refresh_tokens.save(reused)
                    uow.track(reused)
                    await self._audit(
                        uow,
                        AuditAction.REFRESH_REUSE_DETECTED,
                        reused.user_id,
                        ctx,
                        target_type="refresh_token_family",
                        target_id=reused.id,
                    )
                    await uow.commit()
                raise AuthenticationError("Tu sesión venció. Inicia sesión de nuevo.")

            user = await uow.users.get(family.user_id)
            if user is None or not user.can_log_in(now) or not family.is_active(now):
                raise AuthenticationError("Tu sesión venció. Inicia sesión de nuevo.")

            new_token = generate_token()
            retired = family.rotate(presented, hash_token(new_token), now)
            await uow.refresh_tokens.save(family, retired_hash=retired)
            await uow.commit()
            return SessionTokens(self._access_tokens.issue(user, now), new_token)

    async def logout(self, refresh_token: str, ctx: RequestContext) -> None:
        now = self._clock.now()
        async with self._uow_factory() as uow:
            family = await uow.refresh_tokens.get_by_current_hash(hash_token(refresh_token))
            if family is None or family.revoked_at is not None:
                return
            family.revoke(RevocationReason.LOGOUT, now)
            await uow.refresh_tokens.save(family)
            await self._audit(uow, AuditAction.LOGOUT, family.user_id, ctx)
            await uow.commit()

    async def authenticate(self, access_token: str) -> UserAccount:
        """Usuario activo dueño del access token. Se consulta en cada solicitud para que una
        cuenta deshabilitada pierda el acceso de inmediato."""
        now = self._clock.now()
        user_id = self._access_tokens.user_id_from(access_token, now)
        async with self._uow_factory() as uow:
            user = await uow.users.get(user_id)
        if user is None or user.status is not UserStatus.ACTIVE:
            raise AuthenticationError("Tu sesión no es válida. Inicia sesión de nuevo.")
        return user

    # --- Invitaciones ---------------------------------------------------------------------

    async def invite(
        self,
        actor: UserAccount,
        email: str,
        full_name: str,
        roles: frozenset[Role],
        ctx: RequestContext,
    ) -> UserAccount:
        self._require(actor, Permission.USERS_MANAGE)
        now = self._clock.now()
        address = Email(email)
        async with self._uow_factory() as uow:
            if await uow.users.get_by_email(address) is not None:
                raise ConflictError("Ya existe una cuenta con ese correo.", code="email_taken")
            user = UserAccount.invite(
                id=new_id(), email=address, full_name=full_name, roles=roles, now=now
            )
            await uow.users.add(user)
            uow.track(user)
            token = await self._issue_token(uow, user, TokenPurpose.INVITATION)
            await self._audit(
                uow,
                AuditAction.USER_INVITED,
                actor.id,
                ctx,
                user,
                roles=sorted(r.value for r in roles),
            )
            await uow.commit()
        await self._send_invitation(user, token)
        return user

    async def invite_first_admin(self, email: str, full_name: str) -> UserAccount:
        """Arranque de una instalación nueva: solo funciona si todavía no existe ningún usuario."""
        now = self._clock.now()
        address = Email(email)
        async with self._uow_factory() as uow:
            if await uow.users.exists_any():
                raise ConflictError(
                    "Ya existen usuarios. Invita administradores desde la aplicación.",
                    code="already_initialized",
                )
            user = UserAccount.invite(
                id=new_id(),
                email=address,
                full_name=full_name,
                roles=frozenset({Role.ADMIN}),
                now=now,
            )
            await uow.users.add(user)
            uow.track(user)
            token = await self._issue_token(uow, user, TokenPurpose.INVITATION)
            await self._audit(uow, AuditAction.USER_INVITED, None, RequestContext(), user)
            await uow.commit()
        await self._send_invitation(user, token)
        return user

    async def resend_invitation(
        self, actor: UserAccount, user_id: UUID, ctx: RequestContext
    ) -> None:
        self._require(actor, Permission.USERS_MANAGE)
        async with self._uow_factory() as uow:
            user = await uow.users.get(user_id)
            if user is None:
                raise NotFoundError("La cuenta no existe.")
            if user.status is not UserStatus.INVITED:
                raise ConflictError("La cuenta ya fue activada.", code="invitation_used")
            token = await self._issue_token(uow, user, TokenPurpose.INVITATION)
            await self._audit(uow, AuditAction.INVITATION_RESENT, actor.id, ctx, user)
            await uow.commit()
        await self._send_invitation(user, token)

    async def accept_invitation(self, token: str, password: str, ctx: RequestContext) -> None:
        now = self._clock.now()
        async with self._uow_factory() as uow:
            stored = await uow.tokens.get_by_hash(hash_token(token))
            if stored is None:
                raise InvalidTokenError()
            user = await uow.users.get(stored.user_id)
            if user is None:
                raise InvalidTokenError()
            stored.consume(TokenPurpose.INVITATION, now)
            validate_password(password, user.email)
            user.activate(self._hasher.hash(password), now)
            await uow.tokens.save(stored)
            await uow.users.save(user)
            uow.track(user)
            await self._audit(uow, AuditAction.USER_ACTIVATED, user.id, ctx, user)
            await uow.commit()

    # --- Recuperación de acceso ----------------------------------------------------------

    async def request_password_reset(self, email: str, ctx: RequestContext) -> None:
        """Siempre termina igual, exista o no la cuenta, para no revelar qué correos existen."""
        try:
            address = Email(email)
        except ValidationFailedError:
            return
        async with self._uow_factory() as uow:
            user = await uow.users.get_by_email(address)
            if user is None or user.status is not UserStatus.ACTIVE:
                return
            token = await self._issue_token(uow, user, TokenPurpose.PASSWORD_RESET)
            await self._audit(uow, AuditAction.PASSWORD_RESET_REQUESTED, user.id, ctx, user)
            await uow.commit()
        await self._safe_send(
            user.email,
            "Restablece tu contraseña",
            f"Hola, {user.full_name}:\n\n"
            "Recibimos una solicitud para restablecer tu contraseña. Usa este enlace dentro de "
            f"los próximos 30 minutos:\n\n{self._links.password_reset(token)}\n\n"
            "Si no la solicitaste, ignora este correo; tu contraseña no cambiará.",
        )

    async def reset_password(self, token: str, password: str, ctx: RequestContext) -> None:
        now = self._clock.now()
        async with self._uow_factory() as uow:
            stored = await uow.tokens.get_by_hash(hash_token(token))
            if stored is None:
                raise InvalidTokenError()
            user = await uow.users.get(stored.user_id)
            if user is None:
                raise InvalidTokenError()
            stored.consume(TokenPurpose.PASSWORD_RESET, now)
            validate_password(password, user.email)
            user.change_password(self._hasher.hash(password))
            await uow.tokens.save(stored)
            await uow.users.save(user)
            # Cambiar la contraseña cierra todas las sesiones abiertas.
            await uow.refresh_tokens.revoke_all_for_user(
                user.id, RevocationReason.PASSWORD_CHANGED, now
            )
            await self._audit(uow, AuditAction.PASSWORD_RESET_COMPLETED, user.id, ctx, user)
            await uow.commit()

    # --- Auxiliares -----------------------------------------------------------------------

    @staticmethod
    def _require(actor: UserAccount, permission: Permission) -> None:
        if not actor.has_permission(permission):
            raise PermissionDeniedError("No tienes permiso para realizar esta operación.")

    async def _issue_token(
        self, uow: IdentityUnitOfWork, user: UserAccount, purpose: TokenPurpose
    ) -> str:
        now = self._clock.now()
        await uow.tokens.invalidate_pending(user.id, purpose, now)
        raw = generate_token()
        await uow.tokens.add(
            OneTimeToken.issue(
                id=new_id(), user_id=user.id, purpose=purpose, token_hash=hash_token(raw), now=now
            )
        )
        return raw

    async def _send_invitation(self, user: UserAccount, token: str) -> None:
        await self._safe_send(
            user.email,
            "Activa tu cuenta",
            f"Hola, {user.full_name}:\n\n"
            "Te invitaron a la plataforma de la veterinaria. Activa tu cuenta y elige tu "
            f"contraseña en los próximos 7 días:\n\n{self._links.invitation(token)}",
        )

    async def _safe_send(self, to: Email, subject: str, body: str) -> None:
        # El cambio ya está confirmado. Si el correo falla, se registra y se puede reenviar.
        try:
            await self._email.send(to, subject, body)
        except Exception:
            logger.exception("No se pudo enviar el correo '%s'", subject)

    async def _audit(
        self,
        uow: IdentityUnitOfWork,
        action: AuditAction,
        actor_id: UUID | None,
        ctx: RequestContext,
        target: UserAccount | None = None,
        *,
        target_type: str | None = None,
        target_id: UUID | None = None,
        **details: Any,
    ) -> None:
        await uow.audit.record(
            AuditEntry(
                id=new_id(),
                occurred_at=self._clock.now(),
                action=action,
                actor_id=actor_id,
                target_type="user_account" if target else target_type,
                target_id=target.id if target else target_id,
                ip_address=ctx.ip_address,
                details=details,
            )
        )
