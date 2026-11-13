from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from vetcare.contexts.identity.public.http import CurrentUser
from vetcare.contexts.tracking.application.services import TrackingService, TrackingView
from vetcare.contexts.tracking.domain.tracking import (
    MAX_UPDATE_LENGTH,
    EntryKind,
    Template,
    TrackingStatus,
)
from vetcare.platform.errors import problem_responses

router = APIRouter(tags=["Seguimiento"])
me_router = APIRouter(prefix="/me", tags=["Mi cuenta"])


def tracking(request: Request) -> TrackingService:
    service: TrackingService = request.app.state.tracking
    return service


Tracking = Annotated[TrackingService, Depends(tracking)]

_READ = problem_responses({401: "No autenticado", 403: "Sin acceso", 404: "No existe"})
_WRITE = problem_responses(
    {
        401: "No autenticado",
        403: "Sin permiso (p. ej. el alta la autoriza un veterinario)",
        404: "No existe",
        409: "La etapa ya cambió, el servicio terminó o la cita no tiene la llegada registrada",
        422: "Datos inválidos",
    }
)


class StageResponse(BaseModel):
    code: str
    label: str
    state: Literal["done", "current", "pending"]
    reached_at: datetime | None


class UpdateResponse(BaseModel):
    id: UUID
    at: datetime
    text: str


class TrackedServiceResponse(BaseModel):
    id: UUID
    appointment_id: UUID
    pet_id: UUID
    pet_name: str
    service_name: str
    template: Template
    status: TrackingStatus
    stages: list[StageResponse]
    current_stage: str
    next_stage: str | None = Field(description="Etiqueta de la etapa siguiente, si queda alguna.")
    next_is_discharge: bool = Field(description="El siguiente paso es el alta de una cirugía.")
    updates: list[UpdateResponse] = Field(description="Avances publicados, del más reciente.")
    updates_hidden: bool = Field(
        description="El cliente no ve los textos de los avances (su tutela no incluye lo clínico)."
    )
    started_at: datetime
    updated_at: datetime
    handed_over_at: datetime | None

    @classmethod
    def of(cls, view: TrackingView) -> "TrackedServiceResponse":
        s = view.service
        stages = [
            StageResponse(
                code=stage.code,
                label=stage.label,
                state="done" if i < s.current else "current" if i == s.current else "pending",
                reached_at=s.stage_reached_at(i) if i <= s.current else None,
            )
            for i, stage in enumerate(s.stages)
        ]
        updates = [
            UpdateResponse(id=e.id, at=e.at, text=e.text or "")
            for e in reversed(s.timeline)
            if e.kind is EntryKind.UPDATE
        ]
        handed = next((e.at for e in s.timeline if e.kind is EntryKind.HANDED_OVER), None)
        return cls(
            id=s.id,
            appointment_id=s.appointment_id,
            pet_id=s.pet_id,
            pet_name=s.pet_name,
            service_name=s.service_name,
            template=s.template,
            status=s.status,
            stages=stages,
            current_stage=s.current_stage.code,
            next_stage=s.next_stage.label if s.next_stage else None,
            next_is_discharge=s.advancing_needs_discharge,
            updates=updates if view.can_see_updates else [],
            updates_hidden=not view.can_see_updates and bool(updates),
            started_at=s.started_at,
            updated_at=s.updated_at,
            handed_over_at=handed,
        )


class AdvanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_stage: str = Field(
        max_length=40, description="Etapa actual que ve quien avanza; si cambió, responde 409."
    )


class UpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=MAX_UPDATE_LENGTH)


@router.post(
    "/appointments/{appointment_id}/tracking",
    summary="Iniciar el seguimiento de una cita",
    description="Con la llegada registrada. Idempotente: si ya existe, lo devuelve.",
    responses=_WRITE,
)
async def start_tracking(
    appointment_id: UUID, user: CurrentUser, service: Tracking
) -> TrackedServiceResponse:
    return TrackedServiceResponse.of(await service.start(user, appointment_id))


@router.get(
    "/appointments/{appointment_id}/tracking",
    summary="Seguimiento de una cita",
    responses=_READ,
)
async def tracking_of_appointment(
    appointment_id: UUID, user: CurrentUser, service: Tracking
) -> TrackedServiceResponse:
    return TrackedServiceResponse.of(await service.of_appointment(user, appointment_id))


@router.get(
    "/tracked-services",
    summary="Tablero de seguimiento",
    description="En curso y listos para recoger, más lo entregado en las últimas 12 horas.",
    responses=_READ,
)
async def board(user: CurrentUser, service: Tracking) -> list[TrackedServiceResponse]:
    return [TrackedServiceResponse.of(v) for v in await service.board(user)]


@router.get("/tracked-services/{service_id}", summary="Detalle del seguimiento", responses=_READ)
async def get_tracked_service(
    service_id: UUID, user: CurrentUser, service: Tracking
) -> TrackedServiceResponse:
    return TrackedServiceResponse.of(await service.get(user, service_id))


@router.post(
    "/tracked-services/{service_id}/advance",
    summary="Pasar a la etapa siguiente",
    responses=_WRITE,
)
async def advance(
    service_id: UUID, body: AdvanceRequest, user: CurrentUser, service: Tracking
) -> TrackedServiceResponse:
    return TrackedServiceResponse.of(await service.advance(user, service_id, body.from_stage))


@router.post(
    "/tracked-services/{service_id}/updates",
    summary="Publicar un avance para el dueño",
    responses=_WRITE,
)
async def publish_update(
    service_id: UUID, body: UpdateRequest, user: CurrentUser, service: Tracking
) -> TrackedServiceResponse:
    return TrackedServiceResponse.of(await service.publish_update(user, service_id, body.text))


@router.post(
    "/tracked-services/{service_id}/hand-over",
    summary="Entregar la mascota",
    responses=_WRITE,
)
async def hand_over(
    service_id: UUID, user: CurrentUser, service: Tracking
) -> TrackedServiceResponse:
    return TrackedServiceResponse.of(await service.hand_over(user, service_id))


@me_router.get(
    "/tracked-services",
    summary="Seguimiento de mis mascotas",
    description="Servicios de la última semana de las mascotas con tutela activa.",
    responses=_READ,
)
async def my_tracked_services(user: CurrentUser, service: Tracking) -> list[TrackedServiceResponse]:
    return [TrackedServiceResponse.of(v) for v in await service.mine(user)]
