from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Nombres de restricciones deterministas para que Alembic genere migraciones estables.
metadata = MetaData(
    naming_convention={
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s",
        "pk": "pk_%(table_name)s",
    }
)


def create_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(
        database_url,
        # READ COMMITTED: cada lectura ve lo último confirmado. Con REPEATABLE READ (el defecto de
        # MySQL) la primera lectura fija una foto para toda la transacción, y una transacción que
        # esperó un bloqueo seguiría sin ver lo que confirmó la otra. Las reglas de concurrencia
        # se garantizan con bloqueos explícitos (SELECT … FOR UPDATE) y versiones optimistas.
        isolation_level="READ COMMITTED",
        pool_pre_ping=True,
        pool_recycle=3600,
        connect_args={"init_command": "SET time_zone = '+00:00'"},
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
