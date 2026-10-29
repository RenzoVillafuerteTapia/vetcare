import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from vetcare.contexts.identity.domain.permissions import (
    STAFF_ROLES,
    Permission,
    Role,
    permissions_for,
)
from vetcare.shared_kernel.domain import AggregateRoot, DomainEvent
from vetcare.shared_kernel.errors import ConflictError, FieldError, ValidationFailedError

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class Email:
    """Correo normalizado en minúsculas; identifica la cuenta."""

    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().lower()
        if len(normalized) > 254 or not _EMAIL.match(normalized):
            raise ValidationFailedError(
                "El correo no es válido.", [FieldError("email", "Ingresa un correo válido.")]
            )
        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value


class UserStatus(StrEnum):
    INVITED = "invited"
    ACTIVE = "active"
    DISABLED = "disabled"


@dataclass(frozen=True)
class LockoutPolicy:
    max_failed_attempts: int = 5
    lock_duration: timedelta = timedelta(minutes=15)


@dataclass(frozen=True, kw_only=True)
class UserInvited(DomainEvent):
    event_type: ClassVar[str] = "identity.user_invited"
    roles: tuple[Role, ...]


@dataclass(frozen=True, kw_only=True)
class UserActivated(DomainEvent):
    event_type: ClassVar[str] = "identity.user_activated"


@dataclass(frozen=True, kw_only=True)
class UserLockedOut(DomainEvent):
    event_type: ClassVar[str] = "identity.user_locked_out"
    locked_until: datetime


@dataclass
class UserAccount(AggregateRoot):
    """Cuenta de acceso de un cliente o de un empleado.

    Los datos de contacto viven en otros contextos (p. ej. Customers & Pets).
    """

    aggregate_type: ClassVar[str] = "user_account"

    id: UUID
    email: Email
    full_name: str
    roles: frozenset[Role]
    status: UserStatus
    created_at: datetime
    password_hash: str | None = None
    failed_login_attempts: int = 0
    locked_until: datetime | None = None
    activated_at: datetime | None = None
    last_login_at: datetime | None = None
    version: int = field(default=0, compare=False)

    @classmethod
    def invite(
        cls, *, id: UUID, email: Email, full_name: str, roles: frozenset[Role], now: datetime
    ) -> "UserAccount":
        full_name = full_name.strip()
        errors: list[FieldError] = []
        if not 2 <= len(full_name) <= 150:
            errors.append(FieldError("full_name", "Ingresa el nombre completo (2 a 150 letras)."))
        if not roles:
            errors.append(FieldError("roles", "Asigna al menos un rol."))
        elif Role.CLIENT in roles and roles & STAFF_ROLES:
            errors.append(
                FieldError("roles", "Una cuenta de cliente no puede tener roles del personal.")
            )
        if errors:
            raise ValidationFailedError("Revisa los datos de la invitación.", errors)

        user = cls(
            id=id,
            email=email,
            full_name=full_name,
            roles=roles,
            status=UserStatus.INVITED,
            created_at=now,
        )
        user.record(UserInvited(aggregate_id=id, occurred_at=now, roles=tuple(sorted(roles))))
        return user

    @property
    def permissions(self) -> frozenset[Permission]:
        return permissions_for(self.roles)

    def has_permission(self, permission: Permission) -> bool:
        return self.status is UserStatus.ACTIVE and permission in self.permissions

    def activate(self, password_hash: str, now: datetime) -> None:
        if self.status is not UserStatus.INVITED:
            raise ConflictError("La invitación ya fue utilizada.", code="invitation_used")
        self.password_hash = password_hash
        self.status = UserStatus.ACTIVE
        self.activated_at = now
        self.record(UserActivated(aggregate_id=self.id, occurred_at=now))

    def change_password(self, password_hash: str) -> None:
        if self.status is not UserStatus.ACTIVE:
            raise ConflictError("La cuenta no está activa.", code="account_not_active")
        self.password_hash = password_hash
        self.failed_login_attempts = 0
        self.locked_until = None

    def is_locked(self, now: datetime) -> bool:
        return self.locked_until is not None and now < self.locked_until

    def can_log_in(self, now: datetime) -> bool:
        return self.status is UserStatus.ACTIVE and not self.is_locked(now)

    def record_failed_login(self, now: datetime, policy: LockoutPolicy) -> None:
        if self.is_locked(now):
            return
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= policy.max_failed_attempts:
            self.locked_until = now + policy.lock_duration
            self.failed_login_attempts = 0
            self.record(
                UserLockedOut(aggregate_id=self.id, occurred_at=now, locked_until=self.locked_until)
            )

    def record_successful_login(self, now: datetime) -> None:
        self.failed_login_attempts = 0
        self.locked_until = None
        self.last_login_at = now

    def disable(self) -> None:
        self.status = UserStatus.DISABLED
