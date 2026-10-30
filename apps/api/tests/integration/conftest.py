"""Pruebas contra MySQL real.

Usan ``VETCARE_TEST_DATABASE_URL``. Si no está definida, se omiten, salvo que
``VETCARE_REQUIRE_INTEGRATION=1`` (así en CI), donde la falta de base de datos es un error.
"""

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from integration_support import Api, _api
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from vetcare.contexts.clinic.infrastructure import tables as _clinic_tables  # noqa: F401
from vetcare.contexts.identity.infrastructure import tables as _identity_tables  # noqa: F401
from vetcare.platform import outbox as _outbox  # noqa: F401
from vetcare.platform.db import create_engine, create_session_factory, metadata

API_DIR = Path(__file__).resolve().parents[2]
DATABASE_URL = os.environ.get("VETCARE_TEST_DATABASE_URL")


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    if DATABASE_URL:
        return
    if os.environ.get("VETCARE_REQUIRE_INTEGRATION") == "1":
        raise pytest.UsageError(
            "VETCARE_REQUIRE_INTEGRATION=1 pero falta VETCARE_TEST_DATABASE_URL."
        )
    skip = pytest.mark.skip(reason="Define VETCARE_TEST_DATABASE_URL para usar MySQL.")
    for item in items:
        if Path(str(item.fspath)).is_relative_to(Path(__file__).parent):
            item.add_marker(skip)


def alembic_config() -> Config:
    config = Config(str(API_DIR / "alembic.ini"))
    config.attributes["database_url"] = DATABASE_URL
    return config


@pytest.fixture(scope="session")
def migrated_database() -> Iterator[str]:
    """Deja la base de pruebas en el esquema de la última migración, partiendo de cero."""
    assert DATABASE_URL is not None
    config = alembic_config()
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield DATABASE_URL


@pytest.fixture
async def engine(migrated_database: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(migrated_database)
    yield engine
    async with engine.begin() as connection:
        # Orden inverso de dependencias para respetar las claves foráneas.
        for table in reversed(metadata.sorted_tables):
            await connection.execute(table.delete())
    await engine.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return create_session_factory(engine)


@pytest.fixture
async def api(migrated_database: str, engine: AsyncEngine) -> AsyncIterator[Api]:
    """App real contra la base de pruebas, con un buzón en memoria para los correos."""
    async for value in _api(migrated_database):
        yield value
