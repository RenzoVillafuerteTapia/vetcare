from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.clinic.application.queries import ClinicCatalog
from vetcare.contexts.clinic.application.services import ClinicSetupService
from vetcare.contexts.clinic.infrastructure.repositories import (
    SqlCalendarRepository,
    SqlResourceRepository,
    SqlServiceTypeRepository,
)
from vetcare.platform.unit_of_work import SqlAlchemyUnitOfWork
from vetcare.shared_kernel.clock import SystemClock


class SqlClinicUnitOfWork(SqlAlchemyUnitOfWork):
    service_types: SqlServiceTypeRepository
    resources: SqlResourceRepository
    calendar: SqlCalendarRepository

    async def __aenter__(self) -> "SqlClinicUnitOfWork":
        await super().__aenter__()
        self.service_types = SqlServiceTypeRepository(self.session)
        self.resources = SqlResourceRepository(self.session)
        self.calendar = SqlCalendarRepository(self.session)
        return self


def clinic_uow_factory(
    session_factory: async_sessionmaker[AsyncSession],
) -> Callable[[], SqlClinicUnitOfWork]:
    clock = SystemClock()
    return lambda: SqlClinicUnitOfWork(session_factory, clock)


def build_clinic_setup(
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[ClinicSetupService, ClinicCatalog]:
    uow = clinic_uow_factory(session_factory)
    return ClinicSetupService(uow), ClinicCatalog(uow)
