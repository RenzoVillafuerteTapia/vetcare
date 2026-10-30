import hashlib
import json
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from pydantic import AwareDatetime

from vetcare.contexts.identity.public import AuthenticatedUser, Permission
from vetcare.contexts.identity.public.http import CurrentUser
from vetcare.contexts.scheduling.api.schemas import (
    AppointmentResponse,
    BookAppointmentRequest,
    CancelRequest,
    RescheduleRequest,
    SlotResponse,
)
from vetcare.contexts.scheduling.application.services import Idempotency, SchedulingService
from vetcare.contexts.scheduling.domain.appointment import AppointmentStatus
from vetcare.platform.errors import problem_responses

router = APIRouter(tags=["Agenda"])
me_router = APIRouter(prefix="/me", tags=["Mi cuenta"])


def scheduling(request: Request) -> SchedulingService:
    service: SchedulingService = request.app.state.scheduling
    return service


Scheduling = Annotated[SchedulingService, Depends(scheduling)]

_READ = problem_responses({401: "No autenticado", 403: "Sin acceso", 404: "No existe"})
_WRITE = problem_responses(
    {
        401: "No autenticado",
        403: "Sin permiso",
        404: "No existe",
        409: "Horario no disponible, transición inválida o modificación concurrente",
        422: "Datos inválidos",
    }
)


def _staff(user: AuthenticatedUser) -> bool:
    return user.has_permission(Permission.APPOINTMENTS_READ)


@router.get(
    "/scheduling/availability",
    summary="Horarios disponibles de un servicio en un día",
    description="Considera el horario de la sede, los feriados, el horario y los bloqueos de "
    "cada recurso y las citas activas. Es orientativo: la reserva vuelve a verificarlo.",
    responses=_READ,
)
async def availability(
    user: CurrentUser,
    service: Scheduling,
    service_type_id: UUID,
    day: Annotated[date, Query(alias="date", description="Día en hora de Lima, AAAA-MM-DD.")],
) -> list[SlotResponse]:
    return [SlotResponse.of(o) for o in await service.availability(user, service_type_id, day)]


@router.post(
    "/appointments",
    status_code=status.HTTP_201_CREATED,
    summary="Agendar (personal) o solicitar (cliente) una cita",
    description="El personal agenda citas confirmadas; el cliente, solicitudes que la clínica "
    "confirma. Con `Idempotency-Key`, repetir la misma solicitud devuelve la cita ya creada "
    "(200 y `Idempotent-Replayed: true`) en lugar de duplicarla.",
    responses=_WRITE,
)
async def book(
    body: BookAppointmentRequest,
    user: CurrentUser,
    service: Scheduling,
    response: Response,
    idempotency_key: Annotated[
        str | None, Header(alias="Idempotency-Key", min_length=8, max_length=100)
    ] = None,
) -> AppointmentResponse:
    idempotency = None
    if idempotency_key is not None:
        canonical = json.dumps(body.model_dump(mode="json"), sort_keys=True)
        idempotency = Idempotency(idempotency_key, hashlib.sha256(canonical.encode()).hexdigest())
    result = await service.book(user, body.to_request(), idempotency)
    if result.replayed:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replayed"] = "true"
    return AppointmentResponse.of(result.appointment, staff=_staff(user))


@router.get("/appointments", summary="Agenda del personal en un periodo", responses=_READ)
async def agenda(
    user: CurrentUser,
    service: Scheduling,
    start: Annotated[AwareDatetime, Query(alias="from")],
    end: Annotated[AwareDatetime, Query(alias="to")],
    resource_id: UUID | None = None,
    statuses: Annotated[list[AppointmentStatus] | None, Query(alias="status")] = None,
) -> list[AppointmentResponse]:
    found = await service.agenda(
        user,
        start,
        end,
        resource_id=resource_id,
        statuses=frozenset(statuses) if statuses else None,
    )
    return [AppointmentResponse.of(a, staff=True) for a in found]


@router.get("/appointments/{appointment_id}", summary="Detalle de una cita", responses=_READ)
async def get_appointment(
    appointment_id: UUID, user: CurrentUser, service: Scheduling
) -> AppointmentResponse:
    return AppointmentResponse.of(await service.get(user, appointment_id), staff=_staff(user))


@router.post(
    "/appointments/{appointment_id}/reschedule",
    summary="Reprogramar (el cliente, con la antelación mínima; vuelve a quedar por confirmar)",
    responses=_WRITE,
)
async def reschedule(
    appointment_id: UUID, body: RescheduleRequest, user: CurrentUser, service: Scheduling
) -> AppointmentResponse:
    appointment = await service.reschedule(
        user, appointment_id, body.start, frozenset(body.resource_ids)
    )
    return AppointmentResponse.of(appointment, staff=_staff(user))


@router.post(
    "/appointments/{appointment_id}/cancel",
    summary="Cancelar (el cliente, con la antelación mínima si ya estaba confirmada)",
    responses=_WRITE,
)
async def cancel(
    appointment_id: UUID, body: CancelRequest, user: CurrentUser, service: Scheduling
) -> AppointmentResponse:
    appointment = await service.cancel(user, appointment_id, body.reason)
    return AppointmentResponse.of(appointment, staff=_staff(user))


@router.post(
    "/appointments/{appointment_id}/confirm", summary="Confirmar una solicitud", responses=_WRITE
)
async def confirm(
    appointment_id: UUID, user: CurrentUser, service: Scheduling
) -> AppointmentResponse:
    return AppointmentResponse.of(await service.confirm(user, appointment_id), staff=True)


@router.post(
    "/appointments/{appointment_id}/check-in", summary="Registrar la llegada", responses=_WRITE
)
async def check_in(
    appointment_id: UUID, user: CurrentUser, service: Scheduling
) -> AppointmentResponse:
    return AppointmentResponse.of(await service.check_in(user, appointment_id), staff=True)


@router.post(
    "/appointments/{appointment_id}/complete", summary="Completar la atención", responses=_WRITE
)
async def complete(
    appointment_id: UUID, user: CurrentUser, service: Scheduling
) -> AppointmentResponse:
    return AppointmentResponse.of(await service.complete(user, appointment_id), staff=True)


@router.post(
    "/appointments/{appointment_id}/no-show",
    summary="Registrar la inasistencia",
    responses=_WRITE,
)
async def no_show(
    appointment_id: UUID, user: CurrentUser, service: Scheduling
) -> AppointmentResponse:
    return AppointmentResponse.of(await service.mark_no_show(user, appointment_id), staff=True)


@me_router.get(
    "/appointments",
    summary="Citas de mis mascotas",
    description="Próximas y de los últimos 90 días, de las mascotas donde el cliente tiene tutela.",
    responses=_READ,
)
async def my_appointments(user: CurrentUser, service: Scheduling) -> list[AppointmentResponse]:
    return [AppointmentResponse.of(a, staff=False) for a in await service.my_appointments(user)]
