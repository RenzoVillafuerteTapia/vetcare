from types import TracebackType
from typing import Self

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.platform.outbox import outbox_events, outbox_row
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.domain import AggregateRoot


class SqlAlchemyUnitOfWork:
    """Implementa ``shared_kernel.application.UnitOfWork`` sobre una sesión de SQLAlchemy.

    Los repositorios de cada contexto usan ``session``; el caso de uso llama a ``track`` con los
    agregados que modificó y a ``commit`` al final.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], clock: Clock) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._session: AsyncSession | None = None
        self._tracked: list[AggregateRoot] = []

    @property
    def session(self) -> AsyncSession:
        if self._session is None:
            raise RuntimeError("La unidad de trabajo no está abierta; úsala con 'async with'.")
        return self._session

    async def __aenter__(self) -> Self:
        self._session = self._session_factory()
        self._tracked = []
        await self._session.begin()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        session = self.session
        try:
            if session.in_transaction():
                await session.rollback()
        finally:
            await session.close()
            self._session = None
            self._tracked = []

    def track(self, aggregate: AggregateRoot) -> None:
        if not any(tracked is aggregate for tracked in self._tracked):
            self._tracked.append(aggregate)

    async def commit(self) -> None:
        session = self.session
        recorded_at = self._clock.now()
        rows = [
            outbox_row(event, aggregate.aggregate_type, recorded_at)
            for aggregate in self._tracked
            for event in aggregate.pull_events()
        ]
        if rows:
            await session.execute(insert(outbox_events), rows)
        await session.commit()
        self._tracked = []
