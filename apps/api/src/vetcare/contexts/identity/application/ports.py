from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from vetcare.contexts.identity.domain.audit import AuditEntry
from vetcare.contexts.identity.domain.model import Email, UserAccount
from vetcare.contexts.identity.domain.tokens import (
    OneTimeToken,
    RefreshTokenFamily,
    RevocationReason,
    TokenPurpose,
)
from vetcare.shared_kernel.application import UnitOfWork


class UserRepository(Protocol):
    async def get(self, user_id: UUID) -> UserAccount | None: ...

    async def get_by_email(self, email: Email) -> UserAccount | None: ...

    async def exists_any(self) -> bool: ...

    async def add(self, user: UserAccount) -> None: ...

    async def save(self, user: UserAccount) -> None:
        """Guarda los cambios; si otra transacción lo modificó antes, lanza ConflictError."""
        ...


class OneTimeTokenRepository(Protocol):
    async def get_by_hash(self, token_hash: str) -> OneTimeToken | None: ...

    async def add(self, token: OneTimeToken) -> None: ...

    async def save(self, token: OneTimeToken) -> None: ...

    async def invalidate_pending(
        self, user_id: UUID, purpose: TokenPurpose, now: datetime
    ) -> None: ...


class RefreshTokenRepository(Protocol):
    async def get_by_current_hash(self, token_hash: str) -> RefreshTokenFamily | None: ...

    async def get_by_retired_hash(self, token_hash: str) -> RefreshTokenFamily | None: ...

    async def add(self, family: RefreshTokenFamily) -> None: ...

    async def save(self, family: RefreshTokenFamily, retired_hash: str | None = None) -> None: ...

    async def revoke_all_for_user(
        self, user_id: UUID, reason: RevocationReason, now: datetime
    ) -> None: ...


class AuditLog(Protocol):
    async def record(self, entry: AuditEntry) -> None: ...


class IdentityUnitOfWork(UnitOfWork, Protocol):
    @property
    def users(self) -> UserRepository: ...

    @property
    def tokens(self) -> OneTimeTokenRepository: ...

    @property
    def refresh_tokens(self) -> RefreshTokenRepository: ...

    @property
    def audit(self) -> AuditLog: ...


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password_hash: str, password: str) -> bool: ...

    def needs_rehash(self, password_hash: str) -> bool: ...

    def verify_dummy(self, password: str) -> None:
        """Gasta el mismo tiempo que una verificación real cuando el correo no existe."""
        ...


@dataclass(frozen=True)
class AccessToken:
    token: str
    expires_in_seconds: int


class AccessTokenService(Protocol):
    def issue(self, user: UserAccount, now: datetime) -> AccessToken: ...

    def user_id_from(self, token: str, now: datetime) -> UUID:
        """Valida firma, tipo y vencimiento. Lanza AuthenticationError si algo falla."""
        ...


class EmailSender(Protocol):
    async def send(self, to: Email, subject: str, body: str) -> None: ...
