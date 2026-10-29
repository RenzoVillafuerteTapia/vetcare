from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["Salud"])


class HealthResponse(BaseModel):
    status: Literal["ok"]


@router.get("/health", summary="Verificar que la API está en ejecución")
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
