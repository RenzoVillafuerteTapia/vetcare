import asyncio

from alembic import context
from sqlalchemy.engine import Connection

from vetcare.platform import outbox  # noqa: F401  registra las tablas del outbox en metadata
from vetcare.platform.db import create_engine, metadata
from vetcare.platform.settings import Settings

# Cada contexto que agregue tablas debe importar aquí su módulo de tablas para que
# `alembic revision --autogenerate` y `alembic check` las vean.

target_metadata = metadata


def _database_url() -> str:
    configured = context.config.attributes.get("database_url")
    if configured:
        return str(configured)
    settings = Settings()
    if settings.database_url is None:
        raise RuntimeError("Define VETCARE_DATABASE_URL para ejecutar las migraciones.")
    return settings.database_url.get_secret_value()


def _run(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async() -> None:
    engine = create_engine(_database_url())
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    raise RuntimeError("Las migraciones se ejecutan conectadas a la base de datos.")

asyncio.run(_run_async())
