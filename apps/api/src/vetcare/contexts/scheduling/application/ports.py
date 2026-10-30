from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from vetcare.contexts.scheduling.domain.appointment import (
    Appointment,
    AppointmentStatus,
    TimeSlot,
)
from vetcare.shared_kernel.application import UnitOfWork


class AppointmentRepository(Protocol):
    async def get(
        self, appointment_id: UUID, *, for_update: bool = False
    ) -> Appointment | None: ...

    async def add(self, appointment: Appointment) -> None: ...

    async def save(self, appointment: Appointment) -> None: ...

    async def lock_resources(self, resource_ids: set[UUID]) -> None:
        """Toma un bloqueo exclusivo por recurso hasta el fin de la transacción.

        Serializa las reservas que compiten por los mismos recursos: la segunda espera a que la
        primera confirme y entonces ve su cita.
        """
        ...

    async def busy(
        self,
        resource_ids: set[UUID],
        window: TimeSlot,
        *,
        exclude: UUID | None = None,
    ) -> dict[UUID, list[TimeSlot]]:
        """Lo que ocupan las citas activas de esos recursos dentro de la ventana."""
        ...

    async def between(
        self,
        start: datetime,
        end: datetime,
        *,
        resource_id: UUID | None = None,
        statuses: frozenset[AppointmentStatus] | None = None,
    ) -> list[Appointment]: ...

    async def of_pets(self, pet_ids: list[UUID], since: datetime) -> list[Appointment]: ...


@dataclass(frozen=True)
class StoredRequest:
    request_hash: str
    appointment_id: UUID


class IdempotencyStore(Protocol):
    async def get(self, user_id: UUID, key: str) -> StoredRequest | None: ...

    async def save(self, user_id: UUID, key: str, stored: StoredRequest, now: datetime) -> None:
        """Lanza ConflictError si otra solicitud con la misma clave se guardó antes."""
        ...


class SchedulingUnitOfWork(UnitOfWork, Protocol):
    @property
    def appointments(self) -> AppointmentRepository: ...

    @property
    def idempotency(self) -> IdempotencyStore: ...
