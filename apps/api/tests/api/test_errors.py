from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, Field

from vetcare.platform.errors import PROBLEM_JSON, register_error_handlers
from vetcare.shared_kernel.errors import (
    ConflictError,
    FieldError,
    NotFoundError,
    PermissionDeniedError,
    ValidationFailedError,
)


class Cuerpo(BaseModel):
    nombre: str = Field(min_length=2)
    edad: int


def app_de_prueba() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/no-existe")
    async def no_existe() -> None:
        raise NotFoundError("La mascota no existe.")

    @app.get("/conflicto")
    async def conflicto() -> None:
        raise ConflictError("El horario ya no está disponible.", code="appointment_conflict")

    @app.get("/prohibido")
    async def prohibido() -> None:
        raise PermissionDeniedError("Solo un veterinario puede autorizar el alta.")

    @app.get("/invalido")
    async def invalido() -> None:
        raise ValidationFailedError(
            "Revisa los datos.", [FieldError("peso_kg", "Debe ser mayor que cero.")]
        )

    @app.post("/cuerpo")
    async def cuerpo(_: Cuerpo) -> None:
        return None

    @app.get("/falla")
    async def falla() -> None:
        raise RuntimeError("detalle interno que no debe filtrarse")

    return app


def cliente() -> AsyncClient:
    transport = ASGITransport(app=app_de_prueba(), raise_app_exceptions=False)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_no_encontrado_es_404_problem_json() -> None:
    async with cliente() as c:
        r = await c.get("/no-existe")

    assert r.status_code == 404
    assert r.headers["content-type"] == PROBLEM_JSON
    assert r.json() == {
        "type": "/errors/not-found",
        "title": "Recurso no encontrado",
        "status": 404,
        "code": "not_found",
        "detail": "La mascota no existe.",
    }


async def test_conflicto_conserva_el_codigo_especifico() -> None:
    async with cliente() as c:
        r = await c.get("/conflicto")

    assert r.status_code == 409
    assert r.json()["code"] == "appointment_conflict"
    assert r.json()["type"] == "/errors/appointment-conflict"


async def test_permiso_denegado_es_403() -> None:
    async with cliente() as c:
        r = await c.get("/prohibido")

    assert r.status_code == 403
    assert r.json()["code"] == "permission_denied"


async def test_validacion_de_dominio_lista_los_campos() -> None:
    async with cliente() as c:
        r = await c.get("/invalido")

    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "peso_kg", "message": "Debe ser mayor que cero."}]


async def test_validacion_de_entrada_traduce_los_mensajes_al_espanol() -> None:
    async with cliente() as c:
        r = await c.post("/cuerpo", json={"nombre": "L"})

    assert r.status_code == 422
    assert r.json()["code"] == "validation_failed"
    assert sorted(r.json()["errors"], key=lambda e: e["field"]) == [
        {"field": "edad", "message": "Este campo es obligatorio."},
        {"field": "nombre", "message": "El texto es demasiado corto."},
    ]


async def test_ruta_inexistente_usa_el_mismo_formato() -> None:
    async with cliente() as c:
        r = await c.get("/no-hay-tal-ruta")

    assert r.status_code == 404
    assert r.headers["content-type"] == PROBLEM_JSON
    assert r.json()["code"] == "http_404"


async def test_error_inesperado_no_filtra_detalles_internos() -> None:
    async with cliente() as c:
        r = await c.get("/falla")

    assert r.status_code == 500
    assert r.json() == {
        "type": "/errors/internal-error",
        "title": "Ocurrió un error inesperado",
        "status": 500,
        "code": "internal_error",
    }
    assert "detalle interno" not in r.text
