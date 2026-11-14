from datetime import datetime
from typing import Protocol
from uuid import UUID

from vetcare.contexts.tracking.domain.tracking import TrackedService
from vetcare.shared_kernel.application import UnitOfWork


class TrackedServiceRepository(Protocol):
    async def get(self, service_id: UUID, *, for_update: bool = False) -> TrackedService | None: ...

    async def by_appointment(self, appointment_id: UUID) -> TrackedService | None: ...

    async def add(self, service: TrackedService) -> None: ...

    async def save(self, service: TrackedService) -> None: ...

    async def recent(self, since: datetime) -> list[TrackedService]:
        """En curso o listos, más los entregados desde `since`."""
        ...

    async def of_pets(self, pet_ids: list[UUID], since: datetime) -> list[TrackedService]: ...


class TrackingUnitOfWork(UnitOfWork, Protocol):
    @property
    def services(self) -> TrackedServiceRepository: ...
