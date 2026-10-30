from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.clinic.public import ClinicCatalog
from vetcare.contexts.customers.public import PetAccess
from vetcare.contexts.scheduling.application.services import SchedulingService
from vetcare.contexts.scheduling.domain.appointment import SchedulingPolicy
from vetcare.contexts.scheduling.infrastructure.repositories import (
    SqlAppointmentRepository,
    SqlIdempotencyStore,
)
from vetcare.platform.unit_of_work import SqlAlchemyUnitOfWork
from vetcare.shared_kernel.clock import Clock, SystemClock


class SqlSchedulingUnitOfWork(SqlAlchemyUnitOfWork):
    appointments: SqlAppointmentRepository
    idempotency: SqlIdempotencyStore

    async def __aenter__(self) -> "SqlSchedulingUnitOfWork":
        await super().__aenter__()
        self.appointments = SqlAppointmentRepository(self.session)
        self.idempotency = SqlIdempotencyStore(self.session)
        return self


def build_scheduling(
    session_factory: async_sessionmaker[AsyncSession],
    catalog: ClinicCatalog,
    pets: PetAccess,
    *,
    clock: Clock | None = None,
    policy: SchedulingPolicy | None = None,
) -> SchedulingService:
    real_clock = clock or SystemClock()

    def uow() -> SqlSchedulingUnitOfWork:
        return SqlSchedulingUnitOfWork(session_factory, real_clock)

    return SchedulingService(
        uow_factory=uow, catalog=catalog, pets=pets, clock=real_clock, policy=policy
    )
