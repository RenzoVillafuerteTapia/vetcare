# apps/api

API FastAPI de la plataforma. Arquitectura en [docs/architecture/overview.md](../../docs/architecture/overview.md).

> Estado: **bootstrap.** Solo expone `GET /api/v1/health`. La persistencia, Alembic y los
> bounded contexts llegan con `feature/api-foundation` y siguientes.

## Comandos (dentro del contenedor)

```bash
docker compose run --rm api pytest
docker compose run --rm api coverage run -m pytest
docker compose run --rm api coverage report
docker compose run --rm api ruff check .
docker compose run --rm api ruff format --check .
docker compose run --rm api mypy
```

## Sin Docker (requiere Python 3.12)

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows; en Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
pytest
```
