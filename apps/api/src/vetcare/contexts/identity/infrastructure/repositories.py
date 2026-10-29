from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import exists, insert, select, update
from sqlalchemy.engine import RowMapping
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from vetcare.contexts.identity.domain.audit import AuditEntry
from vetcare.contexts.identity.domain.model import Email, UserAccount, UserStatus
from vetcare.contexts.identity.domain.permissions import Role
from vetcare.contexts.identity.domain.tokens import (
    OneTimeToken,
    RefreshTokenFamily,
    RevocationReason,
    TokenPurpose,
)
from vetcare.contexts.identity.infrastructure.tables import (
    audit_log,
    one_time_tokens,
    refresh_token_families,
    retired_refresh_tokens,
    users,
)
from vetcare.shared_kernel.errors import ConflictError


def _utc(value: datetime | None) -> datetime | None:
    # MySQL DATETIME no guarda zona; todo se escribe en UTC y se lee como UTC.
    return value.replace(tzinfo=UTC) if value is not None else None


def _utc_required(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


def _naive(value: datetime | None) -> datetime | None:
    return value.astimezone(UTC).replace(tzinfo=None) if value is not None else None


class SqlUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: UUID) -> UserAccount | None:
        row = (await self._session.execute(select(users).where(users.c.id == user_id))).first()
        return self._to_domain(row._mapping) if row else None

    async def get_by_email(self, email: Email) -> UserAccount | None:
        # FOR UPDATE serializa los intentos de login sobre la misma cuenta, para que el
        # contador de fallos no pierda incrementos.
        query = select(users).where(users.c.email == email.value).with_for_update()
        row = (await self._session.execute(query)).first()
        return self._to_domain(row._mapping) if row else None

    async def exists_any(self) -> bool:
        return bool(await self._session.scalar(select(exists().select_from(users))))

    async def add(self, user: UserAccount) -> None:
        try:
            async with self._session.begin_nested():
                await self._session.execute(insert(users).values(id=user.id, **self._values(user)))
        except IntegrityError:
            raise ConflictError(
                "Ya existe una cuenta con ese correo.", code="email_taken"
            ) from None

    async def save(self, user: UserAccount) -> None:
        result = await self._session.execute(
            update(users)
            .where(users.c.id == user.id, users.c.version == user.version)
            .values(**self._values(user) | {"version": user.version + 1})
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise ConflictError(
                "La cuenta fue modificada por otra operación. Intenta de nuevo.",
                code="concurrent_modification",
            )
        user.version += 1

    @staticmethod
    def _values(user: UserAccount) -> dict[str, Any]:
        return {
            "email": user.email.value,
            "full_name": user.full_name,
            "roles": sorted(role.value for role in user.roles),
            "status": user.status.value,
            "password_hash": user.password_hash,
            "failed_login_attempts": user.failed_login_attempts,
            "locked_until": _naive(user.locked_until),
            "created_at": _naive(user.created_at),
            "activated_at": _naive(user.activated_at),
            "last_login_at": _naive(user.last_login_at),
            "version": user.version,
        }

    @staticmethod
    def _to_domain(row: RowMapping) -> UserAccount:
        return UserAccount(
            id=row["id"],
            email=Email(row["email"]),
            full_name=row["full_name"],
            roles=frozenset(Role(r) for r in row["roles"]),
            status=UserStatus(row["status"]),
            created_at=_utc_required(row["created_at"]),
            password_hash=row["password_hash"],
            failed_login_attempts=row["failed_login_attempts"],
            locked_until=_utc(row["locked_until"]),
            activated_at=_utc(row["activated_at"]),
            last_login_at=_utc(row["last_login_at"]),
            version=row["version"],
        )


class SqlOneTimeTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_hash(self, token_hash: str) -> OneTimeToken | None:
        query = (
            select(one_time_tokens)
            .where(one_time_tokens.c.token_hash == token_hash)
            .with_for_update()
        )
        row = (await self._session.execute(query)).first()
        if row is None:
            return None
        m = row._mapping
        return OneTimeToken(
            id=m["id"],
            user_id=m["user_id"],
            purpose=TokenPurpose(m["purpose"]),
            token_hash=m["token_hash"],
            created_at=_utc_required(m["created_at"]),
            expires_at=_utc_required(m["expires_at"]),
            used_at=_utc(m["used_at"]),
        )

    async def add(self, token: OneTimeToken) -> None:
        await self._session.execute(
            insert(one_time_tokens).values(
                id=token.id,
                user_id=token.user_id,
                purpose=token.purpose.value,
                token_hash=token.token_hash,
                created_at=_naive(token.created_at),
                expires_at=_naive(token.expires_at),
                used_at=_naive(token.used_at),
            )
        )

    async def save(self, token: OneTimeToken) -> None:
        await self._session.execute(
            update(one_time_tokens)
            .where(one_time_tokens.c.id == token.id)
            .values(used_at=_naive(token.used_at))
        )

    async def invalidate_pending(self, user_id: UUID, purpose: TokenPurpose, now: datetime) -> None:
        await self._session.execute(
            update(one_time_tokens)
            .where(
                one_time_tokens.c.user_id == user_id,
                one_time_tokens.c.purpose == purpose.value,
                one_time_tokens.c.used_at.is_(None),
            )
            .values(used_at=_naive(now))
        )


class SqlRefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_current_hash(self, token_hash: str) -> RefreshTokenFamily | None:
        query = (
            select(refresh_token_families)
            .where(refresh_token_families.c.current_token_hash == token_hash)
            .with_for_update()
        )
        row = (await self._session.execute(query)).first()
        return self._to_domain(row._mapping) if row else None

    async def get_by_retired_hash(self, token_hash: str) -> RefreshTokenFamily | None:
        query = (
            select(refresh_token_families)
            .join(
                retired_refresh_tokens,
                retired_refresh_tokens.c.family_id == refresh_token_families.c.id,
            )
            .where(retired_refresh_tokens.c.token_hash == token_hash)
            .with_for_update()
        )
        row = (await self._session.execute(query)).first()
        return self._to_domain(row._mapping) if row else None

    async def add(self, family: RefreshTokenFamily) -> None:
        await self._session.execute(
            insert(refresh_token_families).values(id=family.id, **self._values(family))
        )

    async def save(self, family: RefreshTokenFamily, retired_hash: str | None = None) -> None:
        await self._session.execute(
            update(refresh_token_families)
            .where(refresh_token_families.c.id == family.id)
            .values(**self._values(family))
        )
        if retired_hash is not None:
            await self._session.execute(
                insert(retired_refresh_tokens).values(token_hash=retired_hash, family_id=family.id)
            )

    async def revoke_all_for_user(
        self, user_id: UUID, reason: RevocationReason, now: datetime
    ) -> None:
        await self._session.execute(
            update(refresh_token_families)
            .where(
                refresh_token_families.c.user_id == user_id,
                refresh_token_families.c.revoked_at.is_(None),
            )
            .values(revoked_at=_naive(now), revocation_reason=reason.value)
        )

    @staticmethod
    def _values(family: RefreshTokenFamily) -> dict[str, Any]:
        return {
            "user_id": family.user_id,
            "current_token_hash": family.current_token_hash,
            "created_at": _naive(family.created_at),
            "expires_at": _naive(family.expires_at),
            "rotated_at": _naive(family.rotated_at),
            "revoked_at": _naive(family.revoked_at),
            "revocation_reason": family.revocation_reason.value
            if family.revocation_reason
            else None,
        }

    @staticmethod
    def _to_domain(row: RowMapping) -> RefreshTokenFamily:
        reason = row["revocation_reason"]
        return RefreshTokenFamily(
            id=row["id"],
            user_id=row["user_id"],
            current_token_hash=row["current_token_hash"],
            created_at=_utc_required(row["created_at"]),
            expires_at=_utc_required(row["expires_at"]),
            rotated_at=_utc(row["rotated_at"]),
            revoked_at=_utc(row["revoked_at"]),
            revocation_reason=RevocationReason(reason) if reason else None,
        )


class SqlAuditLog:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(self, entry: AuditEntry) -> None:
        await self._session.execute(
            insert(audit_log).values(
                id=entry.id,
                occurred_at=_naive(entry.occurred_at),
                action=entry.action.value,
                actor_id=entry.actor_id,
                target_type=entry.target_type,
                target_id=entry.target_id,
                ip_address=entry.ip_address,
                details=entry.details,
            )
        )
