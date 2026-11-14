from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status

from vetcare.contexts.clinic.api.schemas import (
    CalendarResponse,
    CreateResourceRequest,
    CreateServiceTypeRequest,
    HolidayRequest,
    OpeningHoursRequest,
    ResourceResponse,
    ServiceTypeFields,
    ServiceTypeResponse,
    SetActiveRequest,
    TimeOffRequest,
    UpdateResourceRequest,
    schedule_from,
)
from vetcare.contexts.clinic.application.services import (
    ClinicSetupService,
    ResourceData,
    ServiceTypeData,
)
from vetcare.contexts.identity.public.http import CurrentUser
from vetcare.platform.errors import problem_responses

router = APIRouter(prefix="/clinic", tags=["Configuración de la clínica"])


def clinic_setup(request: Request) -> ClinicSetupService:
    service: ClinicSetupService = request.app.state.clinic_setup
    return service


Clinic = Annotated[ClinicSetupService, Depends(clinic_setup)]

_READ = problem_responses({401: "No autenticado", 403: "Sin acceso"})
_WRITE = problem_responses(
    {
        401: "No autenticado",
        403: "Requiere clinic_setup:manage",
        404: "No existe",
        409: "Conflicto con el estado actual o modificación concurrente",
        422: "Datos inválidos",
    }
)


def _service_data(body: ServiceTypeFields) -> ServiceTypeData:
    return ServiceTypeData(
        name=body.name,
        category=body.category,
        duration_minutes=body.duration_minutes,
        required_resources=frozenset(body.required_resources),
        bookable_by_client=body.bookable_by_client,
        description=body.description,
    )


# --- Catálogo de servicios -------------------------------------------------------------------


@router.get(
    "/service-types",
    summary="Catálogo de servicios",
    description="El personal ve todo el catálogo; el cliente, solo los servicios activos que "
    "puede reservar.",
    responses=_READ,
)
async def list_service_types(user: CurrentUser, clinic: Clinic) -> list[ServiceTypeResponse]:
    return [ServiceTypeResponse.of(s) for s in await clinic.list_service_types(user)]


@router.post(
    "/service-types",
    status_code=status.HTTP_201_CREATED,
    summary="Crear un servicio",
    responses=_WRITE,
)
async def create_service_type(
    body: CreateServiceTypeRequest, user: CurrentUser, clinic: Clinic
) -> ServiceTypeResponse:
    created = await clinic.create_service_type(user, body.code, _service_data(body))
    return ServiceTypeResponse.of(created)


@router.put(
    "/service-types/{service_type_id}",
    summary="Actualizar un servicio (el código no cambia)",
    responses=_WRITE,
)
async def update_service_type(
    service_type_id: UUID, body: ServiceTypeFields, user: CurrentUser, clinic: Clinic
) -> ServiceTypeResponse:
    updated = await clinic.update_service_type(user, service_type_id, _service_data(body))
    return ServiceTypeResponse.of(updated)


@router.patch(
    "/service-types/{service_type_id}/active",
    summary="Activar o desactivar un servicio",
    responses=_WRITE,
)
async def set_service_type_active(
    service_type_id: UUID, body: SetActiveRequest, user: CurrentUser, clinic: Clinic
) -> ServiceTypeResponse:
    updated = await clinic.set_service_type_active(user, service_type_id, body.active)
    return ServiceTypeResponse.of(updated)


# --- Recursos --------------------------------------------------------------------------------


@router.get("/resources", summary="Recursos agendables (solo personal)", responses=_READ)
async def list_resources(user: CurrentUser, clinic: Clinic) -> list[ResourceResponse]:
    return [ResourceResponse.of(r) for r in await clinic.list_resources(user)]


@router.post(
    "/resources",
    status_code=status.HTTP_201_CREATED,
    summary="Crear un recurso con su horario semanal",
    responses=_WRITE,
)
async def create_resource(
    body: CreateResourceRequest, user: CurrentUser, clinic: Clinic
) -> ResourceResponse:
    created = await clinic.create_resource(
        user,
        ResourceData(
            kind=body.kind,
            name=body.name,
            schedule=schedule_from(body.schedule),
            user_id=body.user_id,
        ),
    )
    return ResourceResponse.of(created)


@router.put(
    "/resources/{resource_id}",
    summary="Actualizar nombre, horario, cuenta vinculada y estado de un recurso",
    responses=_WRITE,
)
async def update_resource(
    resource_id: UUID, body: UpdateResourceRequest, user: CurrentUser, clinic: Clinic
) -> ResourceResponse:
    updated = await clinic.update_resource(
        user,
        resource_id,
        name=body.name,
        schedule=schedule_from(body.schedule),
        user_id=body.user_id,
        active=body.active,
    )
    return ResourceResponse.of(updated)


@router.post(
    "/resources/{resource_id}/time-off",
    status_code=status.HTTP_201_CREATED,
    summary="Bloquear un recurso (vacaciones, mantenimiento)",
    responses=_WRITE,
)
async def add_time_off(
    resource_id: UUID, body: TimeOffRequest, user: CurrentUser, clinic: Clinic
) -> ResourceResponse:
    updated = await clinic.add_time_off(user, resource_id, body.start, body.end, body.reason)
    return ResourceResponse.of(updated)


@router.delete(
    "/resources/{resource_id}/time-off/{time_off_id}",
    summary="Quitar un bloqueo",
    responses=_WRITE,
)
async def remove_time_off(
    resource_id: UUID, time_off_id: UUID, user: CurrentUser, clinic: Clinic
) -> ResourceResponse:
    return ResourceResponse.of(await clinic.remove_time_off(user, resource_id, time_off_id))


# --- Calendario de la sede -------------------------------------------------------------------


@router.get("/calendar", summary="Horario de atención y feriados de la sede", responses=_READ)
async def get_calendar(user: CurrentUser, clinic: Clinic) -> CalendarResponse:
    return CalendarResponse.of(await clinic.get_calendar(user))


@router.put("/calendar/opening-hours", summary="Fijar el horario de atención", responses=_WRITE)
async def set_opening_hours(
    body: OpeningHoursRequest, user: CurrentUser, clinic: Clinic
) -> CalendarResponse:
    updated = await clinic.set_opening_hours(user, schedule_from(body.opening_hours))
    return CalendarResponse.of(updated)


@router.post(
    "/calendar/holidays",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un feriado",
    responses=_WRITE,
)
async def add_holiday(body: HolidayRequest, user: CurrentUser, clinic: Clinic) -> CalendarResponse:
    return CalendarResponse.of(await clinic.add_holiday(user, body.day, body.name))


@router.delete("/calendar/holidays/{day}", summary="Quitar un feriado", responses=_WRITE)
async def remove_holiday(day: date, user: CurrentUser, clinic: Clinic) -> CalendarResponse:
    return CalendarResponse.of(await clinic.remove_holiday(user, day))
