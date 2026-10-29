from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID


class AuditAction(StrEnum):
    LOGIN_SUCCEEDED = "auth.login_succeeded"
    LOGIN_FAILED = "auth.login_failed"
    ACCOUNT_LOCKED = "auth.account_locked"
    LOGOUT = "auth.logout"
    REFRESH_REUSE_DETECTED = "auth.refresh_reuse_detected"
    PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"  # noqa: S105
    PASSWORD_RESET_COMPLETED = "auth.password_reset_completed"  # noqa: S105
    USER_INVITED = "users.invited"
    INVITATION_RESENT = "users.invitation_resent"
    USER_ACTIVATED = "users.activated"


@dataclass(frozen=True)
class AuditEntry:
    """Registro inmutable de una acción sensible. Nunca guarda contraseñas, tokens ni hashes."""

    id: UUID
    occurred_at: datetime
    action: AuditAction
    actor_id: UUID | None
    target_type: str | None = None
    target_id: UUID | None = None
    ip_address: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
