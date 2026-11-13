from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, ConfigDict, Field

from vetcare.contexts.identity.public.http import CurrentUser
from vetcare.contexts.notifications.application.services import DevicesService
from vetcare.contexts.notifications.domain.device import DevicePlatform
from vetcare.platform.errors import problem_responses
from vetcare.platform.rate_limit import rate_limit

me_router = APIRouter(prefix="/me/devices", tags=["Mi cuenta"])


def devices(request: Request) -> DevicesService:
    service: DevicesService = request.app.state.devices
    return service


Devices = Annotated[DevicesService, Depends(devices)]

_RESPONSES = problem_responses(
    {401: "No autenticado", 403: "Solo para clientes", 422: "Token inválido"}
)


class DeviceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(
        min_length=10,
        max_length=200,
        description="Token de Expo del teléfono (ExponentPushToken[…]).",
    )
    platform: DevicePlatform


class DeviceTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=10, max_length=200)


@me_router.put(
    "",
    summary="Recibir avisos en este teléfono",
    description=(
        "Registra el teléfono para los avisos push (cita confirmada, reprogramada o cancelada "
        "por la veterinaria). Es idempotente; si el teléfono estaba en otra cuenta, pasa a esta."
    ),
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPONSES,
    dependencies=[Depends(rate_limit("register_device", limit=20, window_seconds=60))],
)
async def register_device(body: DeviceRequest, user: CurrentUser, service: Devices) -> None:
    await service.register(user, body.token, body.platform)


@me_router.post(
    "/unregister",
    summary="Dejar de recibir avisos en este teléfono",
    description="Se usa al cerrar sesión. Responde igual aunque el token no exista.",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPONSES,
)
async def unregister_device(body: DeviceTokenRequest, user: CurrentUser, service: Devices) -> None:
    await service.unregister(user, body.token)
