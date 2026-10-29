"""Documento OpenAPI de la API: contrato del que se generan los tipos de ``packages/shared``.

Ajusta lo que FastAPI genera para que coincida con las respuestas reales: los errores usan
``application/problem+json`` con el esquema ``ProblemDetails``, también los 422 de validación.

Se exporta sin levantar el servidor con ``python -m vetcare.cli export-openapi <archivo>``.
"""

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from vetcare.platform.errors import PROBLEM_JSON

_PROBLEM_REF = {"$ref": "#/components/schemas/ProblemDetails"}
_FASTAPI_VALIDATION_SCHEMAS = ("HTTPValidationError", "ValidationError")


def build_openapi(app: FastAPI) -> dict[str, Any]:
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    for operations in schema.get("paths", {}).values():
        for operation in operations.values():
            for status, response in operation.get("responses", {}).items():
                if not status.startswith(("4", "5")):
                    continue
                content = response.get("content", {})
                json_schema = content.get("application/json", {}).get("schema")
                if status == "422" or json_schema == _PROBLEM_REF:
                    response["content"] = {PROBLEM_JSON: {"schema": _PROBLEM_REF}}
                    if status == "422" and response.get("description") == "Validation Error":
                        response["description"] = "Datos inválidos"
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    for name in _FASTAPI_VALIDATION_SCHEMAS:
        components.pop(name, None)
    return schema


def install(app: FastAPI) -> None:
    cache: dict[str, Any] = {}

    def openapi() -> dict[str, Any]:
        if not cache:
            cache.update(build_openapi(app))
        return cache

    app.openapi = openapi  # type: ignore[method-assign]
