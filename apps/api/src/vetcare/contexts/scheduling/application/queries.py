"""Consultas que Scheduling ofrece a otros contextos (p. ej. el seguimiento de servicios)."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from vetcare.contexts.scheduling.application.ports import SchedulingUnitOfWork


@dataclass(frozen=True)
class AppointmentSummary:
    id: UUID
    pet_id: UUID
    pet_name: str
    client_id: UUID
    service_type_id: UUID
    service_name: str
    status: str
    start: datetime
    end: datetime


class AppointmentDirectory:
    def __init__(self, uow_factory: Callable[[], SchedulingUnitOfWork]) -> None:
        self._uow_factory = uow_factory

    async def appointment(self, appointment_id: UUID) -> AppointmentSummary | None:
        async with self._uow_factory() as uow:
            a = await uow.appointments.get(appointment_id)
        if a is None:
            return None
        return AppointmentSummary(
            id=a.id,
            pet_id=a.pet_id,
            pet_name=a.pet_name,
            client_id=a.client_id,
            service_type_id=a.service_type_id,
            service_name=a.service_name,
            status=a.status.value,
            start=a.slot.start,
            end=a.slot.end,
        )
