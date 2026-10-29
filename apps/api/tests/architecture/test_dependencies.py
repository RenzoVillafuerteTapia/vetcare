"""Reglas de dependencia de docs/architecture/overview.md, verificadas sobre los imports reales."""

import ast
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[2] / "src" / "vetcare"

FRAMEWORKS = ("fastapi", "starlette", "pydantic", "pydantic_settings", "sqlalchemy", "alembic")


def imports_of(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            found.add(node.module)
    return found


def modules_in(layer_dir_name: str) -> list[Path]:
    return sorted(SRC.glob(f"contexts/*/{layer_dir_name}/**/*.py"))


def starts_with_any(module: str, prefixes: tuple[str, ...]) -> bool:
    return any(module == p or module.startswith(p + ".") for p in prefixes)


def violations(paths: list[Path], forbidden: tuple[str, ...]) -> list[str]:
    return [
        f"{path.relative_to(SRC)} importa {module}"
        for path in paths
        for module in sorted(imports_of(path))
        if starts_with_any(module, forbidden)
    ]


def test_el_verificador_detecta_imports_prohibidos(tmp_path: Path) -> None:
    archivo = tmp_path / "modelo.py"
    archivo.write_text(
        "import sqlalchemy.orm\n"
        "from fastapi import Depends\n"
        "from vetcare.shared_kernel import ids\n",
        encoding="utf-8",
    )

    encontrados = [m for m in sorted(imports_of(archivo)) if starts_with_any(m, FRAMEWORKS)]

    assert encontrados == ["fastapi", "sqlalchemy.orm"]


def test_shared_kernel_es_python_puro() -> None:
    paths = sorted((SRC / "shared_kernel").glob("**/*.py"))
    assert paths, "No se encontró el shared kernel"
    assert violations(paths, (*FRAMEWORKS, "vetcare.platform", "vetcare.contexts")) == []


def test_el_dominio_no_depende_de_frameworks_ni_de_otras_capas() -> None:
    forbidden = (*FRAMEWORKS, "vetcare.platform")
    errores = violations(modules_in("domain"), forbidden)
    for path in modules_in("domain"):
        contexto = path.relative_to(SRC / "contexts").parts[0]
        for capa in ("application", "infrastructure", "api"):
            errores += violations([path], (f"vetcare.contexts.{contexto}.{capa}",))
    assert errores == []


def test_la_aplicacion_no_depende_de_la_web_ni_de_la_persistencia() -> None:
    forbidden = ("fastapi", "starlette", "sqlalchemy", "alembic")
    errores = violations(modules_in("application"), forbidden)
    for path in modules_in("application"):
        contexto = path.relative_to(SRC / "contexts").parts[0]
        for capa in ("infrastructure", "api"):
            errores += violations([path], (f"vetcare.contexts.{contexto}.{capa}",))
    assert errores == []


@pytest.mark.parametrize("path", sorted(SRC.glob("contexts/*/**/*.py")), ids=str)
def test_los_contextos_solo_se_comunican_por_su_modulo_public(path: Path) -> None:
    propio = path.relative_to(SRC / "contexts").parts[0]
    for module in imports_of(path):
        if module.startswith("vetcare.contexts.") and not module.startswith(
            f"vetcare.contexts.{propio}."
        ):
            partes = module.split(".")
            assert len(partes) >= 4 and partes[3] == "public", (
                f"{path.relative_to(SRC)} importa {module}; usa vetcare.contexts.{partes[2]}.public"
            )
