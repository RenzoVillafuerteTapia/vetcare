"""Tokens de un solo uso (invitación, recuperación) y familias de refresh tokens.

Solo se guarda el hash de cada token: quien lea la base de datos no puede usarlos.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from vetcare.shared_kernel.domain import AggregateRoot, DomainEvent
from vetcare.shared_kernel.errors import ConflictError


class TokenPurpose(StrEnum):
    INVITATION = "invitation"
    PASSWORD_RESET = "password_reset"  # noqa: S105


TOKEN_LIFETIME: dict[TokenPurpose, timedelta] = {
    TokenPurpose.INVITATION: timedelta(days=7),
    TokenPurpose.PASSWORD_RESET: timedelta(minutes=30),
}


class InvalidTokenError(ConflictError):
    code = "invalid_token"

    def __init__(self) -> None:
        super().__init__("El enlace no es válido o ya venció. Solicita uno nuevo.")


@dataclass
class OneTimeToken:
    id: UUID
    user_id: UUID
    purpose: TokenPurpose
    token_hash: str
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None = None

    @classmethod
    def issue(
        cls, *, id: UUID, user_id: UUID, purpose: TokenPurpose, token_hash: str, now: datetime
    ) -> "OneTimeToken":
        return cls(
            id=id,
            user_id=user_id,
            purpose=purpose,
            token_hash=token_hash,
            created_at=now,
            expires_at=now + TOKEN_LIFETIME[purpose],
        )

    def is_usable(self, now: datetime) -> bool:
        return self.used_at is None and now < self.expires_at

    def consume(self, purpose: TokenPurpose, now: datetime) -> None:
        if self.purpose is not purpose or not self.is_usable(now):
            raise InvalidTokenError()
        self.used_at = now

    def invalidate(self, now: datetime) -> None:
        if self.used_at is None:
            self.used_at = now


class RevocationReason(StrEnum):
    LOGOUT = "logout"
    REUSE_DETECTED = "reuse_detected"
    PASSWORD_CHANGED = "password_changed"  # noqa: S105
    ACCOUNT_DISABLED = "account_disabled"


@dataclass(frozen=True, kw_only=True)
class RefreshTokenReuseDetected(DomainEvent):
    event_type: ClassVar[str] = "identity.refresh_token_reuse_detected"
    user_id: UUID


REFRESH_LIFETIME = timedelta(days=30)


@dataclass
class RefreshTokenFamily(AggregateRoot):
    """Una sesión iniciada con contraseña. Cada refresh rota el token vigente.

    Presentar un token ya rotado indica que alguien lo copió: se revoca toda la familia y ambas
    partes deben volver a iniciar sesión.
    """

    aggregate_type: ClassVar[str] = "refresh_token_family"

    id: UUID
    user_id: UUID
    current_token_hash: str
    created_at: datetime
    expires_at: datetime
    rotated_at: datetime | None = None
    revoked_at: datetime | None = None
    revocation_reason: RevocationReason | None = None

    @classmethod
    def start(
        cls, *, id: UUID, user_id: UUID, token_hash: str, now: datetime
    ) -> "RefreshTokenFamily":
        return cls(
            id=id,
            user_id=user_id,
            current_token_hash=token_hash,
            created_at=now,
            expires_at=now + REFRESH_LIFETIME,
        )

    def is_active(self, now: datetime) -> bool:
        return self.revoked_at is None and now < self.expires_at

    def rotate(self, presented_hash: str, new_hash: str, now: datetime) -> str:
        """Devuelve el hash retirado, que queda registrado para detectar su reutilización."""
        if presented_hash != self.current_token_hash or not self.is_active(now):
            raise InvalidTokenError()
        retired = self.current_token_hash
        self.current_token_hash = new_hash
        self.rotated_at = now
        return retired

    def revoke(self, reason: RevocationReason, now: datetime) -> None:
        if self.revoked_at is not None:
            return
        self.revoked_at = now
        self.revocation_reason = reason
        if reason is RevocationReason.REUSE_DETECTED:
            self.record(
                RefreshTokenReuseDetected(
                    aggregate_id=self.id, occurred_at=now, user_id=self.user_id
                )
            )
