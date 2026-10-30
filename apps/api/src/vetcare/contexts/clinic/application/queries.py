"""Consultas de solo lectura que Clinic Setup ofrece a otros contextos (p. ej. Scheduling)."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from vetcare.contexts.clinic.application.ports import ClinicUnitOfWork
from vetcare.contexts.clinic.domain.model import (
    Resource,
    ResourceKind,
    ServiceCategory,
    ServiceType,
)


@dataclass(frozen=True)
class ServiceTypeView:
    id: UUID
    code: str
    name: str
    category: ServiceCategory
    duration_minutes: int
    required_resources: frozenset[ResourceKind]
    bookable_by_client: bool
    active: bool

    @classmethod
    def of(cls, service_type: ServiceType) -> "ServiceTypeView":
        return cls(
            id=service_type.id,
            code=service_type.code.value,
            name=service_type.name,
            category=service_type.category,
            duration_minutes=service_type.duration.minutes,
            required_resources=service_type.required_resources,
            bookable_by_client=service_type.bookable_by_client,
            active=service_type.active,
        )


@dataclass(frozen=True)
class ResourceView:
    """Un recurso con su regla de disponibilidad (horario semanal y bloqueos)."""

    id: UUID
    kind: ResourceKind
    name: str
    user_id: UUID | None
    _resource: Resource

    @classmethod
    def of(cls, resource: Resource) -> "ResourceView":
        return cls(
            id=resource.id,
            kind=resource.kind,
            name=resource.name,
            user_id=resource.user_id,
            _resource=resource,
        )

    def is_available(self, start: datetime, end: datetime) -> bool:
        return self._resource.is_available(start, end)


class ClinicCatalog:
    def __init__(self, uow_factory: Callable[[], ClinicUnitOfWork]) -> None:
        self._uow_factory = uow_factory

    async def service_type(self, service_type_id: UUID) -> ServiceTypeView | None:
        async with self._uow_factory() as uow:
            service_type = await uow.service_types.get(service_type_id)
        return ServiceTypeView.of(service_type) if service_type else None

    async def active_resources(self, kinds: frozenset[ResourceKind]) -> list[ResourceView]:
        async with self._uow_factory() as uow:
            resources = await uow.resources.find(kinds)
        return [ResourceView.of(r) for r in resources if r.active]

    async def is_open(self, start: datetime, end: datetime) -> bool:
        async with self._uow_factory() as uow:
            calendar = await uow.calendar.get()
        return calendar.is_open(start, end)
