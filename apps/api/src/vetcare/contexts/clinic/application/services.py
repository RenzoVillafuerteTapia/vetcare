"""Casos de uso de Clinic Setup.

Escribir requiere ``clinic_setup:manage``. Leer: el personal ve todo el catálogo y los recursos;
el cliente solo los servicios activos que puede reservar y el calendario de la sede.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

from vetcare.contexts.clinic.application.ports import ClinicUnitOfWork
from vetcare.contexts.clinic.domain.model import (
    ClinicCalendar,
    Duration,
    Resource,
    ResourceKind,
    ServiceCategory,
    ServiceCode,
    ServiceType,
    TimeOff,
)
from vetcare.contexts.clinic.domain.schedule import WeeklySchedule
from vetcare.contexts.identity.public import AuthenticatedUser, Permission
from vetcare.shared_kernel.errors import ConflictError, NotFoundError, PermissionDeniedError
from vetcare.shared_kernel.ids import new_id


@dataclass(frozen=True)
class ServiceTypeData:
    name: str
    category: ServiceCategory
    duration_minutes: int
    required_resources: frozenset[ResourceKind]
    bookable_by_client: bool
    description: str = ""


@dataclass(frozen=True)
class ResourceData:
    kind: ResourceKind
    name: str
    schedule: WeeklySchedule
    user_id: UUID | None = None


def _require_manage(actor: AuthenticatedUser) -> None:
    if not actor.has_permission(Permission.CLINIC_SETUP_MANAGE):
        raise PermissionDeniedError("Solo la administración puede cambiar la configuración.")


def _is_staff(actor: AuthenticatedUser) -> bool:
    return actor.has_permission(Permission.APPOINTMENTS_READ)


def _is_client(actor: AuthenticatedUser) -> bool:
    return actor.has_permission(Permission.OWN_APPOINTMENTS_MANAGE)


class ClinicSetupService:
    def __init__(self, uow_factory: Callable[[], ClinicUnitOfWork]) -> None:
        self._uow_factory = uow_factory

    # --- Catálogo de servicios -------------------------------------------------------------

    async def list_service_types(self, actor: AuthenticatedUser) -> list[ServiceType]:
        if not (_is_staff(actor) or _is_client(actor)):
            raise PermissionDeniedError("No tienes acceso al catálogo de servicios.")
        async with self._uow_factory() as uow:
            service_types = await uow.service_types.all()
        if _is_staff(actor):
            return service_types
        return [s for s in service_types if s.visible_to_clients]

    async def create_service_type(
        self, actor: AuthenticatedUser, code: str, data: ServiceTypeData
    ) -> ServiceType:
        _require_manage(actor)
        service_type = ServiceType(
            id=new_id(),
            code=ServiceCode(code),
            name=data.name,
            category=data.category,
            duration=Duration(data.duration_minutes),
            required_resources=data.required_resources,
            bookable_by_client=data.bookable_by_client,
            description=data.description,
        )
        async with self._uow_factory() as uow:
            if await uow.service_types.get_by_code(service_type.code) is not None:
                raise ConflictError("Ya existe un servicio con ese código.", code="code_taken")
            await uow.service_types.add(service_type)
            await uow.commit()
        return service_type

    async def update_service_type(
        self, actor: AuthenticatedUser, service_type_id: UUID, data: ServiceTypeData
    ) -> ServiceType:
        _require_manage(actor)
        async with self._uow_factory() as uow:
            service_type = await self._get_service_type(uow, service_type_id)
            service_type.update(
                name=data.name,
                category=data.category,
                duration=Duration(data.duration_minutes),
                required_resources=data.required_resources,
                bookable_by_client=data.bookable_by_client,
                description=data.description,
            )
            await uow.service_types.save(service_type)
            await uow.commit()
        return service_type

    async def set_service_type_active(
        self, actor: AuthenticatedUser, service_type_id: UUID, active: bool
    ) -> ServiceType:
        _require_manage(actor)
        async with self._uow_factory() as uow:
            service_type = await self._get_service_type(uow, service_type_id)
            service_type.set_active(active)
            await uow.service_types.save(service_type)
            await uow.commit()
        return service_type

    # --- Recursos ---------------------------------------------------------------------------

    async def list_resources(self, actor: AuthenticatedUser) -> list[Resource]:
        if not _is_staff(actor):
            raise PermissionDeniedError("Solo el personal ve los recursos de la agenda.")
        async with self._uow_factory() as uow:
            return await uow.resources.find()

    async def create_resource(self, actor: AuthenticatedUser, data: ResourceData) -> Resource:
        _require_manage(actor)
        resource = Resource(
            id=new_id(),
            kind=data.kind,
            name=data.name,
            schedule=data.schedule,
            user_id=data.user_id,
        )
        async with self._uow_factory() as uow:
            await uow.resources.add(resource)
            await uow.commit()
        return resource

    async def update_resource(
        self,
        actor: AuthenticatedUser,
        resource_id: UUID,
        *,
        name: str,
        schedule: WeeklySchedule,
        user_id: UUID | None,
        active: bool,
    ) -> Resource:
        _require_manage(actor)
        async with self._uow_factory() as uow:
            resource = await self._get_resource(uow, resource_id)
            resource.rename(name)
            resource.set_schedule(schedule)
            resource.link_user(user_id)
            resource.set_active(active)
            await uow.resources.save(resource)
            await uow.commit()
        return resource

    async def add_time_off(
        self,
        actor: AuthenticatedUser,
        resource_id: UUID,
        start: datetime,
        end: datetime,
        reason: str,
    ) -> Resource:
        _require_manage(actor)
        async with self._uow_factory() as uow:
            resource = await self._get_resource(uow, resource_id)
            resource.add_time_off(TimeOff(id=new_id(), start=start, end=end, reason=reason.strip()))
            await uow.resources.save(resource)
            await uow.commit()
        return resource

    async def remove_time_off(
        self, actor: AuthenticatedUser, resource_id: UUID, time_off_id: UUID
    ) -> Resource:
        _require_manage(actor)
        async with self._uow_factory() as uow:
            resource = await self._get_resource(uow, resource_id)
            resource.remove_time_off(time_off_id)
            await uow.resources.save(resource)
            await uow.commit()
        return resource

    # --- Calendario de la sede -------------------------------------------------------------

    async def get_calendar(self, actor: AuthenticatedUser) -> ClinicCalendar:
        if not (_is_staff(actor) or _is_client(actor)):
            raise PermissionDeniedError("No tienes acceso al calendario de la sede.")
        async with self._uow_factory() as uow:
            return await uow.calendar.get()

    async def set_opening_hours(
        self, actor: AuthenticatedUser, schedule: WeeklySchedule
    ) -> ClinicCalendar:
        _require_manage(actor)
        async with self._uow_factory() as uow:
            calendar = await uow.calendar.get()
            calendar.set_opening_hours(schedule)
            await uow.calendar.save(calendar)
            await uow.commit()
        return calendar

    async def add_holiday(self, actor: AuthenticatedUser, day: date, name: str) -> ClinicCalendar:
        _require_manage(actor)
        async with self._uow_factory() as uow:
            calendar = await uow.calendar.get()
            calendar.add_holiday(day, name)
            await uow.calendar.save(calendar)
            await uow.commit()
        return calendar

    async def remove_holiday(self, actor: AuthenticatedUser, day: date) -> ClinicCalendar:
        _require_manage(actor)
        async with self._uow_factory() as uow:
            calendar = await uow.calendar.get()
            calendar.remove_holiday(day)
            await uow.calendar.save(calendar)
            await uow.commit()
        return calendar

    # --- Auxiliares -------------------------------------------------------------------------

    @staticmethod
    async def _get_service_type(uow: ClinicUnitOfWork, service_type_id: UUID) -> ServiceType:
        service_type = await uow.service_types.get(service_type_id)
        if service_type is None:
            raise NotFoundError("El servicio no existe.")
        return service_type

    @staticmethod
    async def _get_resource(uow: ClinicUnitOfWork, resource_id: UUID) -> Resource:
        resource = await uow.resources.get(resource_id)
        if resource is None:
            raise NotFoundError("El recurso no existe.")
        return resource
