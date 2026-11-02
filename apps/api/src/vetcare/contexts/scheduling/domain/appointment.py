from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import ClassVar, TypedDict
from uuid import UUID

from vetcare.shared_kernel.domain import AggregateRoot, DomainEvent
from vetcare.shared_kernel.errors import ConflictError, FieldError, ValidationFailedError
from vetcare.shared_kernel.ids import new_id


@dataclass(frozen=True)
class TimeSlot:
    """Intervalo [start, end) en UTC."""

    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("Los horarios de una cita requieren zona horaria.")
        object.__setattr__(self, "start", self.start.astimezone(UTC))
        object.__setattr__(self, "end", self.end.astimezone(UTC))
        if self.start >= self.end:
            raise ValidationFailedError(
                "El fin de la cita debe ser posterior al inicio.",
                [FieldError("start", "Horario inválido.")],
            )

    @classmethod
    def starting(cls, start: datetime, minutes: int) -> "TimeSlot":
        return cls(start, start + timedelta(minutes=minutes))

    def overlaps(self, other: "TimeSlot") -> bool:
        # Fin exclusivo: una cita que termina a las 10:00 no choca con otra que empieza a las 10:00.
        return self.start < other.end and other.start < self.end


class AppointmentStatus(StrEnum):
    REQUESTED = "requested"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


CHECK_IN_WINDOW = timedelta(hours=2)

# Estados que ocupan los recursos en la agenda.
ACTIVE_STATUSES = frozenset(
    {AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN}
)


class Channel(StrEnum):
    STAFF = "staff"
    CLIENT = "client"


class HistoryAction(StrEnum):
    REQUESTED = "requested"
    BOOKED = "booked"
    CONFIRMED = "confirmed"
    RESCHEDULED = "rescheduled"
    CANCELLED = "cancelled"
    CHECKED_IN = "checked_in"
    COMPLETED = "completed"
    NO_SHOW = "no_show"


@dataclass(frozen=True)
class HistoryEntry:
    id: UUID
    at: datetime
    by: UUID
    action: HistoryAction
    slot: TimeSlot
    note: str | None = None


@dataclass(frozen=True)
class SchedulingPolicy:
    """Reglas configurables de la agenda."""

    slot_step_minutes: int = 15
    # Antelación mínima para que un cliente reprograme o cancele por su cuenta.
    client_change_notice: timedelta = timedelta(hours=2)
    # Cuánto antes del inicio puede un cliente reservar.
    client_booking_lead: timedelta = timedelta(minutes=30)


# --- Eventos (los consumen las notificaciones de la fase 3) ---------------------------------


@dataclass(frozen=True, kw_only=True)
class AppointmentEvent(DomainEvent):
    pet_id: UUID
    client_id: UUID
    start: datetime
    end: datetime


@dataclass(frozen=True, kw_only=True)
class AppointmentRequested(AppointmentEvent):
    event_type: ClassVar[str] = "scheduling.appointment_requested"


@dataclass(frozen=True, kw_only=True)
class AppointmentConfirmed(AppointmentEvent):
    event_type: ClassVar[str] = "scheduling.appointment_confirmed"


@dataclass(frozen=True, kw_only=True)
class AppointmentRescheduled(AppointmentEvent):
    event_type: ClassVar[str] = "scheduling.appointment_rescheduled"
    previous_start: datetime


@dataclass(frozen=True, kw_only=True)
class AppointmentCancelled(AppointmentEvent):
    event_type: ClassVar[str] = "scheduling.appointment_cancelled"
    by_client: bool


@dataclass(frozen=True, kw_only=True)
class AppointmentCheckedIn(AppointmentEvent):
    event_type: ClassVar[str] = "scheduling.appointment_checked_in"
    service_type_id: UUID


@dataclass(frozen=True, kw_only=True)
class AppointmentCompleted(AppointmentEvent):
    event_type: ClassVar[str] = "scheduling.appointment_completed"


@dataclass(frozen=True, kw_only=True)
class AppointmentMarkedNoShow(AppointmentEvent):
    event_type: ClassVar[str] = "scheduling.appointment_marked_no_show"


class _EventFields(TypedDict):
    aggregate_id: UUID
    occurred_at: datetime
    pet_id: UUID
    client_id: UUID
    start: datetime
    end: datetime


def _invalid_transition(action: str, status: AppointmentStatus) -> ConflictError:
    labels = {
        AppointmentStatus.REQUESTED: "solicitada",
        AppointmentStatus.CONFIRMED: "confirmada",
        AppointmentStatus.CHECKED_IN: "en atención",
        AppointmentStatus.COMPLETED: "completada",
        AppointmentStatus.CANCELLED: "cancelada",
        AppointmentStatus.NO_SHOW: "marcada como inasistencia",
    }
    return ConflictError(
        f"No se puede {action} una cita {labels[status]}.", code="invalid_appointment_transition"
    )


@dataclass
class Appointment(AggregateRoot):
    aggregate_type: ClassVar[str] = "appointment"

    id: UUID
    pet_id: UUID
    pet_name: str
    client_id: UUID
    service_type_id: UUID
    service_name: str
    slot: TimeSlot
    resource_ids: frozenset[UUID]
    status: AppointmentStatus
    channel: Channel
    created_by: UUID
    created_at: datetime
    reason: str | None = None
    notes: str | None = None
    cancellation_reason: str | None = None
    history: list[HistoryEntry] = field(default_factory=list)
    version: int = field(default=0, compare=False)

    def __post_init__(self) -> None:
        if not self.resource_ids:
            raise ValueError("Una cita ocupa al menos un recurso.")
        for name, value, limit in (("reason", self.reason, 500), ("notes", self.notes, 1000)):
            if value is not None and len(value.strip()) > limit:
                raise ValidationFailedError(
                    f"Usa como máximo {limit} caracteres.",
                    [FieldError(name, f"Usa como máximo {limit} caracteres.")],
                )
        self.reason = self.reason.strip() or None if self.reason else None
        self.notes = self.notes.strip() or None if self.notes else None

    @classmethod
    def book(
        cls,
        *,
        pet_id: UUID,
        pet_name: str,
        client_id: UUID,
        service_type_id: UUID,
        service_name: str,
        slot: TimeSlot,
        resource_ids: frozenset[UUID],
        channel: Channel,
        by: UUID,
        now: datetime,
        reason: str | None = None,
        notes: str | None = None,
    ) -> "Appointment":
        """El personal agenda citas confirmadas; el cliente, solicitudes que la clínica confirma."""
        by_client = channel is Channel.CLIENT
        appointment = cls(
            id=new_id(),
            pet_id=pet_id,
            pet_name=pet_name,
            client_id=client_id,
            service_type_id=service_type_id,
            service_name=service_name,
            slot=slot,
            resource_ids=resource_ids,
            status=AppointmentStatus.REQUESTED if by_client else AppointmentStatus.CONFIRMED,
            channel=channel,
            created_by=by,
            created_at=now,
            reason=reason,
            notes=notes,
        )
        appointment._log(HistoryAction.REQUESTED if by_client else HistoryAction.BOOKED, by, now)
        fields = appointment._event_fields(now)
        appointment.record(
            AppointmentRequested(**fields) if by_client else AppointmentConfirmed(**fields)
        )
        return appointment

    @property
    def is_active(self) -> bool:
        return self.status in ACTIVE_STATUSES

    # --- Transiciones -------------------------------------------------------------------------

    def confirm(self, by: UUID, now: datetime) -> None:
        self._require(AppointmentStatus.REQUESTED, action="confirmar")
        self.status = AppointmentStatus.CONFIRMED
        self._log(HistoryAction.CONFIRMED, by, now)
        self.record(AppointmentConfirmed(**self._event_fields(now)))

    def reschedule(
        self,
        slot: TimeSlot,
        resource_ids: frozenset[UUID],
        by: UUID,
        now: datetime,
        *,
        by_client: bool,
        policy: SchedulingPolicy,
    ) -> None:
        self._require(
            AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED, action="reprogramar"
        )
        if by_client:
            self._ensure_client_notice(now, policy, "reprogramar")
        previous = self.slot
        self.slot = slot
        self.resource_ids = resource_ids
        # Un cambio del cliente vuelve a requerir la confirmación de la clínica.
        if by_client:
            self.status = AppointmentStatus.REQUESTED
        self._log(HistoryAction.RESCHEDULED, by, now, note=f"Antes: {previous.start.isoformat()}")
        self.record(
            AppointmentRescheduled(**self._event_fields(now), previous_start=previous.start)
        )

    def cancel(
        self,
        by: UUID,
        now: datetime,
        reason: str | None,
        *,
        by_client: bool,
        policy: SchedulingPolicy,
    ) -> None:
        self._require(AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED, action="cancelar")
        if by_client and self.status is AppointmentStatus.CONFIRMED:
            self._ensure_client_notice(now, policy, "cancelar")
        self.status = AppointmentStatus.CANCELLED
        self.cancellation_reason = reason.strip()[:300] if reason and reason.strip() else None
        self._log(HistoryAction.CANCELLED, by, now, note=self.cancellation_reason)
        self.record(AppointmentCancelled(**self._event_fields(now), by_client=by_client))

    def check_in(self, by: UUID, now: datetime) -> None:
        self._require(AppointmentStatus.CONFIRMED, action="registrar la llegada de")
        if now < self.slot.start - CHECK_IN_WINDOW:
            raise ConflictError(
                "La llegada se registra desde dos horas antes de la cita.",
                code="check_in_too_early",
            )
        self.status = AppointmentStatus.CHECKED_IN
        self._log(HistoryAction.CHECKED_IN, by, now)
        self.record(
            AppointmentCheckedIn(**self._event_fields(now), service_type_id=self.service_type_id)
        )

    def complete(self, by: UUID, now: datetime) -> None:
        self._require(AppointmentStatus.CHECKED_IN, action="completar")
        self.status = AppointmentStatus.COMPLETED
        self._log(HistoryAction.COMPLETED, by, now)
        self.record(AppointmentCompleted(**self._event_fields(now)))

    def mark_no_show(self, by: UUID, now: datetime) -> None:
        self._require(AppointmentStatus.CONFIRMED, action="marcar la inasistencia de")
        if now < self.slot.start:
            raise ConflictError(
                "La inasistencia se registra después de la hora de la cita.",
                code="no_show_too_early",
            )
        self.status = AppointmentStatus.NO_SHOW
        self._log(HistoryAction.NO_SHOW, by, now)
        self.record(AppointmentMarkedNoShow(**self._event_fields(now)))

    # --- Auxiliares ---------------------------------------------------------------------------

    def _require(self, *allowed: AppointmentStatus, action: str) -> None:
        if self.status not in allowed:
            raise _invalid_transition(action, self.status)

    def _ensure_client_notice(self, now: datetime, policy: SchedulingPolicy, action: str) -> None:
        if self.slot.start - now < policy.client_change_notice:
            hours = policy.client_change_notice.total_seconds() / 3600
            raise ConflictError(
                f"Solo puedes {action} con al menos {hours:g} horas de anticipación. "
                "Comunícate con la veterinaria.",
                code="client_change_too_late",
            )

    def _log(self, action: HistoryAction, by: UUID, now: datetime, note: str | None = None) -> None:
        self.history.append(
            HistoryEntry(id=new_id(), at=now, by=by, action=action, slot=self.slot, note=note)
        )

    def _event_fields(self, now: datetime) -> _EventFields:
        return {
            "aggregate_id": self.id,
            "occurred_at": now,
            "pet_id": self.pet_id,
            "client_id": self.client_id,
            "start": self.slot.start,
            "end": self.slot.end,
        }
