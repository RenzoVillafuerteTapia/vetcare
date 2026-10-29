import logging
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from vetcare.platform.errors import problem

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Salud"])


class HealthResponse(BaseModel):
    status: Literal["ok"]


@router.get("/health", summary="Verificar que la API está en ejecución")
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get(
    "/health/ready",
    response_model=HealthResponse,
    summary="Verificar que la API puede atender solicitudes (base de datos disponible)",
    responses={503: {"description": "La base de datos no está disponible"}},
)
async def ready(request: Request) -> HealthResponse | JSONResponse:
    engine: AsyncEngine | None = request.app.state.engine
    if engine is None:
        return problem(503, "Servicio no disponible", "database_not_configured")
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        logger.warning("La base de datos no respondió a la verificación de salud", exc_info=True)
        return problem(503, "Servicio no disponible", "database_unavailable")
    return HealthResponse(status="ok")
