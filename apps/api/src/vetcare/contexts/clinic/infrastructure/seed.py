"""Configuración inicial ficticia para desarrollo y demostraciones.

No contiene datos personales: los recursos son genéricos y los servicios, un catálogo típico de
una veterinaria. Solo carga lo que falta, así que ejecutarlo dos veces no duplica nada.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import time

from vetcare.contexts.clinic.application.ports import ClinicUnitOfWork
from vetcare.contexts.clinic.domain.model import (
    Duration,
    Resource,
    ResourceKind,
    ServiceCategory,
    ServiceCode,
    ServiceType,
)
from vetcare.contexts.clinic.domain.schedule import TimeRange, Weekday, WeeklySchedule
from vetcare.shared_kernel.ids import new_id

K = ResourceKind

_WEEKDAYS = [Weekday.MONDAY, Weekday.TUESDAY, Weekday.WEDNESDAY, Weekday.THURSDAY, Weekday.FRIDAY]

OPENING_HOURS = WeeklySchedule.build(
    [(d, TimeRange(time(9), time(19))) for d in _WEEKDAYS]
    + [(Weekday.SATURDAY, TimeRange(time(9), time(14)))]
)

# Turnos con almuerzo para el personal; los espacios siguen el horario de la sede.
STAFF_HOURS = WeeklySchedule.build(
    [(d, TimeRange(time(9), time(13))) for d in _WEEKDAYS]
    + [(d, TimeRange(time(14), time(19))) for d in _WEEKDAYS]
    + [(Weekday.SATURDAY, TimeRange(time(9), time(14)))]
)

SERVICES: list[tuple[str, str, ServiceCategory, int, frozenset[ResourceKind], bool]] = [
    (
        "consulta",
        "Consulta general",
        ServiceCategory.CONSULTATION,
        30,
        frozenset({K.VETERINARIAN, K.CONSULTATION_ROOM}),
        True,
    ),
    (
        "control",
        "Control posconsulta",
        ServiceCategory.CONSULTATION,
        20,
        frozenset({K.VETERINARIAN, K.CONSULTATION_ROOM}),
        True,
    ),
    (
        "vacunacion",
        "Vacunación",
        ServiceCategory.VACCINATION,
        15,
        frozenset({K.VETERINARIAN, K.CONSULTATION_ROOM}),
        True,
    ),
    (
        "bano",
        "Baño",
        ServiceCategory.GROOMING,
        60,
        frozenset({K.GROOMER, K.GROOMING_STATION}),
        True,
    ),
    (
        "bano-y-corte",
        "Baño y corte",
        ServiceCategory.GROOMING,
        90,
        frozenset({K.GROOMER, K.GROOMING_STATION}),
        True,
    ),
    (
        "esterilizacion",
        "Esterilización",
        ServiceCategory.SURGERY,
        120,
        frozenset({K.VETERINARIAN, K.OPERATING_ROOM}),
        False,
    ),
    (
        "cirugia-menor",
        "Cirugía menor",
        ServiceCategory.SURGERY,
        60,
        frozenset({K.VETERINARIAN, K.OPERATING_ROOM}),
        False,
    ),
]

RESOURCES: list[tuple[ResourceKind, str, WeeklySchedule]] = [
    (K.VETERINARIAN, "Veterinario 1", STAFF_HOURS),
    (K.VETERINARIAN, "Veterinario 2", STAFF_HOURS),
    (K.GROOMER, "Groomer 1", STAFF_HOURS),
    (K.CONSULTATION_ROOM, "Consultorio 1", OPENING_HOURS),
    (K.CONSULTATION_ROOM, "Consultorio 2", OPENING_HOURS),
    (K.GROOMING_STATION, "Estación de baño 1", OPENING_HOURS),
    (K.GROOMING_STATION, "Estación de baño 2", OPENING_HOURS),
    (K.OPERATING_ROOM, "Quirófano", OPENING_HOURS),
]


@dataclass(frozen=True)
class SeedResult:
    service_types: int
    resources: int
    opening_hours: bool


async def seed_clinic(uow_factory: Callable[[], ClinicUnitOfWork]) -> SeedResult:
    async with uow_factory() as uow:
        created_services = 0
        for code, name, category, minutes, kinds, bookable in SERVICES:
            if await uow.service_types.get_by_code(ServiceCode(code)) is None:
                await uow.service_types.add(
                    ServiceType(
                        id=new_id(),
                        code=ServiceCode(code),
                        name=name,
                        category=category,
                        duration=Duration(minutes),
                        required_resources=kinds,
                        bookable_by_client=bookable,
                    )
                )
                created_services += 1

        created_resources = 0
        if not await uow.resources.find():
            for kind, name, schedule in RESOURCES:
                await uow.resources.add(
                    Resource(id=new_id(), kind=kind, name=name, schedule=schedule)
                )
                created_resources += 1

        calendar = await uow.calendar.get()
        set_hours = not calendar.opening_hours.days
        if set_hours:
            calendar.set_opening_hours(OPENING_HOURS)
            await uow.calendar.save(calendar)

        await uow.commit()
    return SeedResult(created_services, created_resources, set_hours)
