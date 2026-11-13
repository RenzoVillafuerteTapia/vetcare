from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.sales.application.services import SalesService
from vetcare.contexts.sales.infrastructure.repositories import (
    SqlChargeRepository,
    SqlProductRepository,
)
from vetcare.platform.unit_of_work import SqlAlchemyUnitOfWork
from vetcare.shared_kernel.clock import Clock, SystemClock


class SqlSalesUnitOfWork(SqlAlchemyUnitOfWork):
    products: SqlProductRepository
    charges: SqlChargeRepository

    async def __aenter__(self) -> "SqlSalesUnitOfWork":
        await super().__aenter__()
        self.products = SqlProductRepository(self.session)
        self.charges = SqlChargeRepository(self.session)
        return self


def build_sales(
    session_factory: async_sessionmaker[AsyncSession], *, clock: Clock | None = None
) -> SalesService:
    real_clock = clock or SystemClock()
    return SalesService(lambda: SqlSalesUnitOfWork(session_factory, real_clock), real_clock)
