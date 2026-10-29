"""Traducción de errores a respuestas ``application/problem+json`` (RFC 9457)."""

import logging
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from vetcare.shared_kernel.errors import (
    ConflictError,
    DomainError,
    NotFoundError,
    PermissionDeniedError,
    ValidationFailedError,
)

logger = logging.getLogger(__name__)

PROBLEM_JSON = "application/problem+json"

_STATUS_BY_ERROR: list[tuple[type[DomainError], int, str]] = [
    (NotFoundError, 404, "Recurso no encontrado"),
    (PermissionDeniedError, 403, "No tienes permiso para realizar esta operación"),
    (ConflictError, 409, "La operación no es compatible con el estado actual"),
    (ValidationFailedError, 422, "Los datos enviados no son válidos"),
]

_HTTP_TITLES = {
    400: "Solicitud mal formada",
    401: "Debes iniciar sesión",
    403: "No tienes permiso para realizar esta operación",
    404: "Recurso no encontrado",
    405: "Método no permitido",
    429: "Demasiadas solicitudes",
}

_VALIDATION_MESSAGES = {
    "missing": "Este campo es obligatorio.",
    "string_too_short": "El texto es demasiado corto.",
    "string_too_long": "El texto es demasiado largo.",
    "string_type": "Debe ser un texto.",
    "int_parsing": "Debe ser un número entero.",
    "int_type": "Debe ser un número entero.",
    "float_parsing": "Debe ser un número.",
    "decimal_parsing": "Debe ser un número.",
    "bool_parsing": "Debe ser verdadero o falso.",
    "uuid_parsing": "Debe ser un identificador válido.",
    "date_parsing": "Debe ser una fecha válida (AAAA-MM-DD).",
    "date_from_datetime_parsing": "Debe ser una fecha válida (AAAA-MM-DD).",
    "datetime_parsing": "Debe ser una fecha y hora válidas.",
    "datetime_from_date_parsing": "Debe ser una fecha y hora válidas.",
    "enum": "El valor no está entre las opciones permitidas.",
    "literal_error": "El valor no está entre las opciones permitidas.",
    "greater_than": "El valor es demasiado pequeño.",
    "greater_than_equal": "El valor es demasiado pequeño.",
    "less_than": "El valor es demasiado grande.",
    "less_than_equal": "El valor es demasiado grande.",
    "value_error": "El valor no es válido.",
    "json_invalid": "El cuerpo de la solicitud no es un JSON válido.",
    "extra_forbidden": "Este campo no está permitido.",
}


def problem(
    status: int,
    title: str,
    code: str,
    detail: str | None = None,
    errors: list[dict[str, str]] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"/errors/{code.replace('_', '-')}",
        "title": title,
        "status": status,
        "code": code,
    }
    if detail:
        body["detail"] = detail
    if errors is not None:
        body["errors"] = errors
    return JSONResponse(body, status_code=status, media_type=PROBLEM_JSON)


def _field_path(loc: tuple[int | str, ...]) -> str:
    # El primer elemento indica dónde vino el dato (body, query, path); no aporta al usuario.
    parts = loc[1:] if loc and loc[0] in {"body", "query", "path", "header"} else loc
    return ".".join(str(p) for p in parts) or "body"


async def _domain_error(_: Request, exc: Exception) -> JSONResponse:
    error = cast(DomainError, exc)
    for error_type, status, title in _STATUS_BY_ERROR:
        if isinstance(error, error_type):
            fields = None
            if isinstance(error, ValidationFailedError):
                fields = [{"field": e.field, "message": e.message} for e in error.errors]
            return problem(status, title, error.code, error.message, fields)
    return problem(400, "No se pudo completar la operación", error.code, error.message)


async def _request_validation_error(_: Request, exc: Exception) -> JSONResponse:
    validation = cast(RequestValidationError, exc)
    errors = [
        {
            "field": _field_path(tuple(err.get("loc", ()))),
            "message": _VALIDATION_MESSAGES.get(err.get("type", ""), "El valor no es válido."),
        }
        for err in validation.errors()
    ]
    return problem(422, "Los datos enviados no son válidos", "validation_failed", errors=errors)


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    http_error = cast(StarletteHTTPException, exc)
    title = _HTTP_TITLES.get(http_error.status_code, "Error en la solicitud")
    response = problem(http_error.status_code, title, f"http_{http_error.status_code}")
    if http_error.headers:
        response.headers.update(http_error.headers)
    return response


async def _unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error no controlado", exc_info=exc)
    return problem(500, "Ocurrió un error inesperado", "internal_error")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, _domain_error)
    app.add_exception_handler(RequestValidationError, _request_validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(Exception, _unexpected_error)
