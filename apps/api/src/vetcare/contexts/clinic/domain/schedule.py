"""Horarios en hora local de la sede (America/Lima).

Los horarios semanales se expresan en hora local porque así los define la veterinaria
("de lunes a viernes de 9:00 a 19:00"). Los instantes concretos (citas, bloqueos) se guardan en
UTC y se convierten a hora local solo para compararlos con el horario.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import IntEnum
from itertools import pairwise
from zoneinfo import ZoneInfo

from vetcare.shared_kernel.errors import FieldError, ValidationFailedError

CLINIC_TZ = ZoneInfo("America/Lima")

GRID_MINUTES = 5


class Weekday(IntEnum):
    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6


WEEKDAY_NAMES = {
    Weekday.MONDAY: "lunes",
    Weekday.TUESDAY: "martes",
    Weekday.WEDNESDAY: "miércoles",
    Weekday.THURSDAY: "jueves",
    Weekday.FRIDAY: "viernes",
    Weekday.SATURDAY: "sábado",
    Weekday.SUNDAY: "domingo",
}


def _on_grid(value: time) -> bool:
    return value.second == 0 and value.microsecond == 0 and value.minute % GRID_MINUTES == 0


@dataclass(frozen=True, order=True)
class TimeRange:
    """Franja horaria dentro de un mismo día, en hora local. El fin es exclusivo."""

    start: time
    end: time

    def __post_init__(self) -> None:
        if self.start >= self.end:
            raise ValidationFailedError(
                "La hora de inicio debe ser anterior a la de fin.",
                [FieldError("end", "Debe ser posterior a la hora de inicio.")],
            )
        if not (_on_grid(self.start) and _on_grid(self.end)):
            raise ValidationFailedError(
                f"Los horarios van en intervalos de {GRID_MINUTES} minutos.",
                [FieldError("start", f"Usa múltiplos de {GRID_MINUTES} minutos.")],
            )

    def overlaps(self, other: "TimeRange") -> bool:
        return self.start < other.end and other.start < self.end

    def contains(self, start: time, end: time) -> bool:
        return self.start <= start and end <= self.end

    def __str__(self) -> str:
        return f"{self.start:%H:%M} a {self.end:%H:%M}"


@dataclass(frozen=True)
class WeeklySchedule:
    """Franjas por día de la semana. Un día sin franjas está cerrado o no disponible."""

    days: Mapping[Weekday, tuple[TimeRange, ...]]

    @classmethod
    def build(cls, entries: Iterable[tuple[Weekday, TimeRange]]) -> "WeeklySchedule":
        grouped: dict[Weekday, list[TimeRange]] = {}
        for weekday, time_range in entries:
            grouped.setdefault(Weekday(weekday), []).append(time_range)
        days: dict[Weekday, tuple[TimeRange, ...]] = {}
        for weekday, ranges in grouped.items():
            ordered = sorted(ranges)
            for previous, current in pairwise(ordered):
                if previous.overlaps(current):
                    raise ValidationFailedError(
                        "El horario tiene franjas superpuestas.",
                        [
                            FieldError(
                                "schedule",
                                f"El {WEEKDAY_NAMES[weekday]} se superponen "
                                f"{previous} y {current}.",
                            )
                        ],
                    )
            days[weekday] = tuple(ordered)
        return cls(days=dict(sorted(days.items())))

    @classmethod
    def empty(cls) -> "WeeklySchedule":
        return cls(days={})

    def entries(self) -> list[tuple[Weekday, TimeRange]]:
        return [(weekday, r) for weekday, ranges in self.days.items() for r in ranges]

    def ranges_on(self, day: date) -> tuple[TimeRange, ...]:
        return self.days.get(Weekday(day.weekday()), ())

    def covers(self, start: datetime, end: datetime) -> bool:
        """¿El intervalo [start, end) cae completo dentro de una franja del mismo día local?

        Las franjas no cruzan la medianoche, así que un intervalo que cambia de día no cabe.
        """
        local_start, local_end = to_local(start), to_local(end)
        if local_end.date() != local_start.date():
            return False
        return any(
            r.contains(local_start.time(), local_end.time())
            for r in self.ranges_on(local_start.date())
        )


def to_local(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        raise ValueError("Se esperaba una fecha y hora con zona horaria.")
    return moment.astimezone(CLINIC_TZ)


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Inicio y fin (exclusivo) de un día local, como instantes con zona."""
    start = datetime.combine(day, time(0), CLINIC_TZ)
    return start, start + timedelta(days=1)
