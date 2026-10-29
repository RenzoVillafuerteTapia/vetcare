import json
from pathlib import Path
from typing import Any

from vetcare.cli import main
from vetcare.main import create_app
from vetcare.platform.settings import Environment, Settings


def contrato() -> dict[str, Any]:
    settings = Settings(environment=Environment.TEST, database_url=None, jwt_secret=None)
    document: dict[str, Any] = create_app(settings).openapi()
    return document


def respuestas() -> list[tuple[str, str, dict[str, Any]]]:
    return [
        (f"{method.upper()} {path}", status, response)
        for path, operations in contrato()["paths"].items()
        for method, operation in operations.items()
        for status, response in operation["responses"].items()
    ]


def test_todos_los_errores_se_documentan_como_problem_json() -> None:
    errores = [(op, s, r) for op, s, r in respuestas() if s.startswith(("4", "5"))]

    assert errores
    for operacion, status, response in errores:
        assert response["content"] == {
            "application/problem+json": {"schema": {"$ref": "#/components/schemas/ProblemDetails"}}
        }, (operacion, status)


def test_no_quedan_los_esquemas_de_validacion_de_fastapi() -> None:
    esquemas = contrato()["components"]["schemas"]

    assert "ProblemDetails" in esquemas
    assert "HTTPValidationError" not in esquemas
    assert "ValidationError" not in esquemas


def test_las_respuestas_202_y_204_no_tienen_cuerpo() -> None:
    sin_cuerpo = [(op, r) for op, s, r in respuestas() if s in {"202", "204"}]

    assert sin_cuerpo
    assert all("content" not in r for _, r in sin_cuerpo), sin_cuerpo


def test_export_openapi_escribe_el_mismo_contrato(tmp_path: Path) -> None:
    destino = tmp_path / "openapi.json"

    assert main(["export-openapi", str(destino)]) == 0

    assert json.loads(destino.read_text(encoding="utf-8")) == contrato()
