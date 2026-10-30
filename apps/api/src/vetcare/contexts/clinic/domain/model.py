import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from vetcare.contexts.clinic.domain.schedule import WeeklySchedule, to_local
from vetcare.shared_kernel.domain import AggregateRoot
from vetcare.shared_kernel.errors import ConflictError, FieldError, ValidationFailedError

# --- Catálogo de servicios -------------------------------------------------------------------


class ServiceCategory(StrEnum):
    CONSULTATION = "consultation"
    VACCINATION = "vaccination"
    GROOMING = "grooming"
    SURGERY = "surgery"
    HOSPITALIZATION = "hospitalization"
    OTHER = "other"


class ResourceKind(StrEnum):
    VETERINARIAN = "veterinarian"
    GROOMER = "groomer"
    CONSULTATION_ROOM = "consultation_room"
    GROOMING_STATION = "grooming_station"
    OPERATING_ROOM = "operating_room"


PROFESSIONAL_KINDS = frozenset({ResourceKind.VETERINARIAN, ResourceKind.GROOMER})

_CODE = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")


def _invalid(field_name: str, message: str) -> ValidationFailedError:
    return ValidationFailedError(message, [FieldError(field_name, message)])


@dataclass(frozen=True)
class ServiceCode:
    """Identificador legible y estable de un servicio, p. ej. ``bano-y-corte``."""

    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().lower()
        if not _CODE.match(normalized):
            raise _invalid(
                "code", "Usa de 2 a 40 letras minúsculas, números o guiones, sin espacios."
            )
        object.__setattr__(self, "value", normalized)


@dataclass(frozen=True)
class Duration:
    minutes: int

    MIN: ClassVar[int] = 5
    MAX: ClassVar[int] = 600

    def __post_init__(self) -> None:
        if not self.MIN <= self.minutes <= self.MAX or self.minutes % 5:
            raise _invalid(
                "duration_minutes", f"Usa entre {self.MIN} y {self.MAX} minutos, en múltiplos de 5."
            )


def _clean_name(name: str, field_name: str = "name") -> str:
    cleaned = " ".join(name.split())
    if not 2 <= len(cleaned) <= 100:
        raise _invalid(field_name, "Usa entre 2 y 100 caracteres.")
    return cleaned


@dataclass
class ServiceType(AggregateRoot):
    """Un servicio que se puede agendar: qué es, cuánto dura y qué recursos ocupa."""

    aggregate_type: ClassVar[str] = "service_type"

    id: UUID
    code: ServiceCode
    name: str
    category: ServiceCategory
    duration: Duration
    required_resources: frozenset[ResourceKind]
    bookable_by_client: bool
    description: str = ""
    active: bool = True
    version: int = field(default=0, compare=False)

    def __post_init__(self) -> None:
        self.name = _clean_name(self.name)
        self.description = self.description.strip()
        if len(self.description) > 500:
            raise _invalid("description", "Usa como máximo 500 caracteres.")
        if not self.required_resources:
            raise _invalid("required_resources", "Elige al menos un recurso que ocupe el servicio.")

    def update(
        self,
        *,
        name: str,
        category: ServiceCategory,
        duration: Duration,
        required_resources: frozenset[ResourceKind],
        bookable_by_client: bool,
        description: str,
    ) -> None:
        candidate = ServiceType(
            id=self.id,
            code=self.code,
            name=name,
            category=category,
            duration=duration,
            required_resources=required_resources,
            bookable_by_client=bookable_by_client,
            description=description,
        )
        self.name = candidate.name
        self.category = candidate.category
        self.duration = candidate.duration
        self.required_resources = candidate.required_resources
        self.bookable_by_client = candidate.bookable_by_client
        self.description = candidate.description

    def set_active(self, active: bool) -> None:
        self.active = active

    @property
    def visible_to_clients(self) -> bool:
        return self.active and self.bookable_by_client


# --- Recursos agendables ---------------------------------------------------------------------


@dataclass(frozen=True)
class TimeOff:
    """Bloqueo de un recurso (vacaciones, mantenimiento) entre dos instantes en UTC."""

    id: UUID
    start: datetime
    end: datetime
    reason: str

    def __post_init__(self) -> None:
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("Los bloqueos requieren fechas con zona horaria.")
        # Los instantes se guardan siempre en UTC, lleguen en la zona que lleguen.
        object.__setattr__(self, "start", self.start.astimezone(UTC))
        object.__setattr__(self, "end", self.end.astimezone(UTC))
        if self.start >= self.end:
            raise _invalid("end", "Debe ser posterior al inicio.")
        if len(self.reason.strip()) > 200:
            raise _invalid("reason", "Usa como máximo 200 caracteres.")

    def overlaps(self, start: datetime, end: datetime) -> bool:
        return self.start < end and start < self.end


@dataclass
class Resource(AggregateRoot):
    """Algo que una cita ocupa y que no puede estar en dos citas a la vez: un profesional, una
    estación de baño, un consultorio o el quirófano."""

    aggregate_type: ClassVar[str] = "resource"

    id: UUID
    kind: ResourceKind
    name: str
    schedule: WeeklySchedule
    user_id: UUID | None = None
    active: bool = True
    time_off: list[TimeOff] = field(default_factory=list)
    version: int = field(default=0, compare=False)

    def __post_init__(self) -> None:
        self.name = _clean_name(self.name)
        if self.user_id is not None and self.kind not in PROFESSIONAL_KINDS:
            raise _invalid("user_id", "Solo un profesional puede vincularse a una cuenta.")

    def rename(self, name: str) -> None:
        self.name = _clean_name(name)

    def link_user(self, user_id: UUID | None) -> None:
        if user_id is not None and self.kind not in PROFESSIONAL_KINDS:
            raise _invalid("user_id", "Solo un profesional puede vincularse a una cuenta.")
        self.user_id = user_id

    def set_schedule(self, schedule: WeeklySchedule) -> None:
        self.schedule = schedule

    def set_active(self, active: bool) -> None:
        self.active = active

    def add_time_off(self, block: TimeOff) -> None:
        clash = next((b for b in self.time_off if b.overlaps(block.start, block.end)), None)
        if clash is not None:
            raise ConflictError("Ya hay un bloqueo en ese periodo.", code="time_off_overlap")
        self.time_off = sorted([*self.time_off, block], key=lambda b: b.start)

    def remove_time_off(self, block_id: UUID) -> None:
        remaining = [b for b in self.time_off if b.id != block_id]
        if len(remaining) == len(self.time_off):
            raise ConflictError("El bloqueo no existe.", code="time_off_not_found")
        self.time_off = remaining

    def is_available(self, start: datetime, end: datetime) -> bool:
        """Activo, dentro de su horario semanal y sin bloqueos en el intervalo."""
        return (
            self.active
            and self.schedule.covers(start, end)
            and not any(b.overlaps(start, end) for b in self.time_off)
        )


# --- Calendario de la sede -------------------------------------------------------------------


@dataclass
class ClinicCalendar(AggregateRoot):
    """Horario de atención de la sede y feriados. Hay uno solo (una sede)."""

    aggregate_type: ClassVar[str] = "clinic_calendar"

    opening_hours: WeeklySchedule
    holidays: dict[date, str] = field(default_factory=dict)
    version: int = field(default=0, compare=False)

    def set_opening_hours(self, schedule: WeeklySchedule) -> None:
        self.opening_hours = schedule

    def add_holiday(self, day: date, name: str) -> None:
        if day in self.holidays:
            raise ConflictError("Ese día ya está registrado como feriado.", code="holiday_exists")
        self.holidays = dict(sorted({**self.holidays, day: _clean_name(name)}.items()))

    def remove_holiday(self, day: date) -> None:
        if day not in self.holidays:
            raise ConflictError(
                "Ese día no está registrado como feriado.", code="holiday_not_found"
            )
        self.holidays = {d: n for d, n in self.holidays.items() if d != day}

    def is_open(self, start: datetime, end: datetime) -> bool:
        """¿La sede atiende durante todo [start, end)? Considera feriados y horario semanal."""
        if to_local(start).date() in self.holidays:
            return False
        return self.opening_hours.covers(start, end)
