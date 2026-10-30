from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from vetcare.contexts.clinic.domain.model import (
    ClinicCalendar,
    Resource,
    ResourceKind,
    ServiceCategory,
    ServiceType,
)
from vetcare.contexts.clinic.domain.schedule import TimeRange, Weekday, WeeklySchedule


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ScheduleEntry(BaseModel):
    weekday: Weekday = Field(description="0 = lunes … 6 = domingo")
    start: time = Field(description="Hora local de inicio (America/Lima), p. ej. `09:00`.")
    end: time = Field(description="Hora local de fin, exclusiva.")


def schedule_from(entries: list[ScheduleEntry]) -> WeeklySchedule:
    return WeeklySchedule.build((e.weekday, TimeRange(e.start, e.end)) for e in entries)


def schedule_to(schedule: WeeklySchedule) -> list[ScheduleEntry]:
    return [ScheduleEntry(weekday=d, start=r.start, end=r.end) for d, r in schedule.entries()]


# --- Catálogo -------------------------------------------------------------------------------


class ServiceTypeFields(_Request):
    name: str = Field(min_length=2, max_length=100)
    category: ServiceCategory
    duration_minutes: int = Field(ge=5, le=600)
    required_resources: list[ResourceKind] = Field(min_length=1, max_length=5)
    bookable_by_client: bool
    description: str = Field(default="", max_length=500)


class CreateServiceTypeRequest(ServiceTypeFields):
    code: str = Field(
        min_length=2, max_length=40, description="Identificador estable, p. ej. `bano-y-corte`."
    )


class SetActiveRequest(_Request):
    active: bool


class ServiceTypeResponse(BaseModel):
    id: UUID
    code: str
    name: str
    category: ServiceCategory
    duration_minutes: int
    required_resources: list[ResourceKind]
    bookable_by_client: bool
    description: str
    active: bool

    @classmethod
    def of(cls, s: ServiceType) -> "ServiceTypeResponse":
        return cls(
            id=s.id,
            code=s.code.value,
            name=s.name,
            category=s.category,
            duration_minutes=s.duration.minutes,
            required_resources=sorted(s.required_resources),
            bookable_by_client=s.bookable_by_client,
            description=s.description,
            active=s.active,
        )


# --- Recursos -------------------------------------------------------------------------------


class CreateResourceRequest(_Request):
    kind: ResourceKind
    name: str = Field(min_length=2, max_length=100)
    schedule: list[ScheduleEntry] = Field(default_factory=list, max_length=50)
    user_id: UUID | None = Field(
        default=None, description="Cuenta del profesional; solo veterinarios y groomers."
    )


class UpdateResourceRequest(_Request):
    name: str = Field(min_length=2, max_length=100)
    schedule: list[ScheduleEntry] = Field(max_length=50)
    user_id: UUID | None = None
    active: bool


class TimeOffRequest(_Request):
    start: AwareDatetime
    end: AwareDatetime
    reason: str = Field(default="", max_length=200)


class TimeOffResponse(BaseModel):
    id: UUID
    start: datetime
    end: datetime
    reason: str


class ResourceResponse(BaseModel):
    id: UUID
    kind: ResourceKind
    name: str
    user_id: UUID | None
    active: bool
    schedule: list[ScheduleEntry]
    time_off: list[TimeOffResponse]

    @classmethod
    def of(cls, r: Resource) -> "ResourceResponse":
        return cls(
            id=r.id,
            kind=r.kind,
            name=r.name,
            user_id=r.user_id,
            active=r.active,
            schedule=schedule_to(r.schedule),
            time_off=[
                TimeOffResponse(id=b.id, start=b.start, end=b.end, reason=b.reason)
                for b in r.time_off
            ],
        )


# --- Calendario -----------------------------------------------------------------------------


class OpeningHoursRequest(_Request):
    opening_hours: list[ScheduleEntry] = Field(max_length=50)


class HolidayRequest(_Request):
    day: date
    name: str = Field(min_length=2, max_length=100)


class Holiday(BaseModel):
    day: date
    name: str


class CalendarResponse(BaseModel):
    timezone: Literal["America/Lima"] = "America/Lima"
    opening_hours: list[ScheduleEntry]
    holidays: list[Holiday]

    @classmethod
    def of(cls, c: ClinicCalendar) -> "CalendarResponse":
        return cls(
            opening_hours=schedule_to(c.opening_hours),
            holidays=[Holiday(day=d, name=n) for d, n in c.holidays.items()],
        )
