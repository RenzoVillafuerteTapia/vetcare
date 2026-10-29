# apps/api

API FastAPI de la plataforma. Arquitectura en [docs/architecture/overview.md](../../docs/architecture/overview.md).

> Estado: **base técnica.** Expone `GET /api/v1/health` y `GET /api/v1/health/ready`. Incluye
> el shared kernel, la unidad de trabajo con outbox transaccional, Alembic y el formato de
> errores problem+json. Todavía no hay bounded contexts implementados.

## Estructura

```
src/vetcare/
├── shared_kernel/   AggregateRoot, DomainEvent, errores de dominio, Clock, UnitOfWork, UUID v7
├── platform/        settings, db, outbox, unidad de trabajo, errores HTTP, salud
└── main.py          composición de la aplicación
migrations/          Alembic (una migración por cambio de esquema)
tests/               unit, api, architecture, integration
```

## Comandos (dentro del contenedor)

```bash
docker compose run --rm api pytest                      # incluye integración con MySQL
docker compose run --rm api coverage run -m pytest
docker compose run --rm api coverage report
docker compose run --rm api ruff check .
docker compose run --rm api ruff format --check .
docker compose run --rm api mypy
docker compose run --rm api alembic upgrade head        # aplica las migraciones a la base de desarrollo
docker compose run --rm api alembic check               # falla si falta una migración
docker compose run --rm api alembic revision --autogenerate -m "descripcion"
```

Al crear tablas de un contexto nuevo, importa su módulo de tablas en `migrations/env.py` para que
Alembic las detecte.

## Sin Docker (requiere Python 3.12)

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows; en Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
pytest                          # sin VETCARE_TEST_DATABASE_URL se omiten las pruebas de integración
```
