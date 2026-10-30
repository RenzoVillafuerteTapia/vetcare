from typing import Protocol
from uuid import UUID

from vetcare.contexts.clinic.domain.model import (
    ClinicCalendar,
    Resource,
    ResourceKind,
    ServiceCode,
    ServiceType,
)
from vetcare.shared_kernel.application import UnitOfWork


class ServiceTypeRepository(Protocol):
    async def get(self, service_type_id: UUID) -> ServiceType | None: ...

    async def get_by_code(self, code: ServiceCode) -> ServiceType | None: ...

    async def all(self) -> list[ServiceType]: ...

    async def add(self, service_type: ServiceType) -> None:
        """Lanza ConflictError si el código ya existe."""
        ...

    async def save(self, service_type: ServiceType) -> None:
        """Lanza ConflictError si otra transacción lo modificó antes."""
        ...


class ResourceRepository(Protocol):
    async def get(self, resource_id: UUID) -> Resource | None: ...

    async def find(self, kinds: frozenset[ResourceKind] | None = None) -> list[Resource]: ...

    async def add(self, resource: Resource) -> None: ...

    async def save(self, resource: Resource) -> None: ...


class CalendarRepository(Protocol):
    async def get(self) -> ClinicCalendar:
        """El calendario de la sede; si no existe, uno vacío (sede cerrada)."""
        ...

    async def save(self, calendar: ClinicCalendar) -> None: ...


class ClinicUnitOfWork(UnitOfWork, Protocol):
    @property
    def service_types(self) -> ServiceTypeRepository: ...

    @property
    def resources(self) -> ResourceRepository: ...

    @property
    def calendar(self) -> CalendarRepository: ...
