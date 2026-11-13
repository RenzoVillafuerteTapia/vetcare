from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.clinic.public import ClinicCatalog
from vetcare.contexts.customers.public import PetAccess
from vetcare.contexts.scheduling.public import AppointmentDirectory
from vetcare.contexts.tracking.application.services import TrackingService
from vetcare.contexts.tracking.infrastructure.repositories import SqlTrackedServiceRepository
from vetcare.platform.unit_of_work import SqlAlchemyUnitOfWork
from vetcare.shared_kernel.clock import Clock, SystemClock


class SqlTrackingUnitOfWork(SqlAlchemyUnitOfWork):
    services: SqlTrackedServiceRepository

    async def __aenter__(self) -> "SqlTrackingUnitOfWork":
        await super().__aenter__()
        self.services = SqlTrackedServiceRepository(self.session)
        return self


def build_tracking(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    appointments: AppointmentDirectory,
    catalog: ClinicCatalog,
    pets: PetAccess,
    clock: Clock | None = None,
) -> TrackingService:
    real_clock = clock or SystemClock()
    return TrackingService(
        uow_factory=lambda: SqlTrackingUnitOfWork(session_factory, real_clock),
        appointments=appointments,
        catalog=catalog,
        pets=pets,
        clock=real_clock,
    )
