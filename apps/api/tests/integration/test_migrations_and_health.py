from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncEngine

from vetcare.main import create_app
from vetcare.platform import outbox  # noqa: F401  registra las tablas en metadata
from vetcare.platform.db import metadata
from vetcare.platform.settings import Environment, Settings


async def test_las_migraciones_coinciden_con_los_modelos(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        diferencias = await connection.run_sync(
            lambda sync: compare_metadata(
                MigrationContext.configure(sync, opts={"compare_type": True}), metadata
            )
        )

    assert diferencias == [], "Falta una migración de Alembic para los cambios de los modelos"


async def test_ready_responde_ok_con_la_base_disponible(migrated_database: str) -> None:
    settings = Settings(environment=Environment.TEST, database_url=SecretStr(migrated_database))
    app = create_app(settings)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")
    await app.state.engine.dispose()

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
