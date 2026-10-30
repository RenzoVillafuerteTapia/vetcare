from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.customers.application.ports import AccountInviter
from vetcare.contexts.customers.application.queries import PetAccess
from vetcare.contexts.customers.application.services import CustomersService
from vetcare.contexts.customers.infrastructure.repositories import (
    SqlClientRepository,
    SqlPetRepository,
)
from vetcare.platform.unit_of_work import SqlAlchemyUnitOfWork
from vetcare.shared_kernel.clock import SystemClock


class SqlCustomersUnitOfWork(SqlAlchemyUnitOfWork):
    clients: SqlClientRepository
    pets: SqlPetRepository

    async def __aenter__(self) -> "SqlCustomersUnitOfWork":
        await super().__aenter__()
        self.clients = SqlClientRepository(self.session)
        self.pets = SqlPetRepository(self.session)
        return self


def customers_uow_factory(
    session_factory: async_sessionmaker[AsyncSession],
) -> Callable[[], SqlCustomersUnitOfWork]:
    clock = SystemClock()
    return lambda: SqlCustomersUnitOfWork(session_factory, clock)


def build_customers(
    session_factory: async_sessionmaker[AsyncSession], inviter: AccountInviter
) -> tuple[CustomersService, PetAccess]:
    uow = customers_uow_factory(session_factory)
    return CustomersService(uow_factory=uow, inviter=inviter, clock=SystemClock()), PetAccess(uow)
