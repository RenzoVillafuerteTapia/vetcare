"""Horarios en hora local de la sede (America/Lima).

Los horarios semanales se expresan en hora local porque así los define la veterinaria
("de lunes a viernes de 9:00 a 19:00"). Los instantes concretos (citas, bloqueos) se guardan en
UTC y se convierten a hora local solo para compararlos con el horario.

Una franja que termina a las 00:00 termina a la medianoche (24:00): así se expresa un día
abierto hasta el final, o las 24 horas con una franja de 00:00 a 00:00. Una franja no cruza la
medianoche, así que 00:00 nunca puede ser un fin "temprano".
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
MIDNIGHT = time(0)
DAY_SECONDS = 24 * 60 * 60


def seconds_of(value: time) -> int:
    return value.hour * 3600 + value.minute * 60 + value.second


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
    """Franja horaria dentro de un mismo día, en hora local. El fin es exclusivo y 00:00 como fin
    significa medianoche (24:00)."""

    start: time
    end: time

    @property
    def start_seconds(self) -> int:
        return seconds_of(self.start)

    @property
    def end_seconds(self) -> int:
        return DAY_SECONDS if self.end == MIDNIGHT else seconds_of(self.end)

    @property
    def until_midnight(self) -> bool:
        return self.end == MIDNIGHT

    def __post_init__(self) -> None:
        if self.start_seconds >= self.end_seconds:
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
        return self.start_seconds < other.end_seconds and other.start_seconds < self.end_seconds

    def contains(self, start_seconds: int, end_seconds: int) -> bool:
        """¿El intervalo [start, end), en segundos desde la medianoche, cabe en la franja?"""
        return self.start_seconds <= start_seconds and end_seconds <= self.end_seconds

    def __str__(self) -> str:
        end = "24:00" if self.until_midnight else f"{self.end:%H:%M}"
        return f"{self.start:%H:%M} a {end}"


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

        Las franjas no cruzan la medianoche: un intervalo puede terminar justo a las 24:00 (si la
        franja llega hasta ahí), pero no seguir en el día siguiente.
        """
        local_start, local_end = to_local(start), to_local(end)
        day = local_start.date()
        if local_end.date() == day:
            end_seconds = seconds_of(local_end.time())
        elif local_end.date() == day + timedelta(days=1) and seconds_of(local_end.time()) == 0:
            end_seconds = DAY_SECONDS
        else:
            return False
        start_seconds = seconds_of(local_start.time())
        return any(r.contains(start_seconds, end_seconds) for r in self.ranges_on(day))


def to_local(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        raise ValueError("Se esperaba una fecha y hora con zona horaria.")
    return moment.astimezone(CLINIC_TZ)


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Inicio y fin (exclusivo) de un día local, como instantes con zona."""
    start = datetime.combine(day, time(0), CLINIC_TZ)
    return start, start + timedelta(days=1)
