from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.notifications.application.handlers import AppointmentPushHandler
from vetcare.contexts.notifications.application.ports import ClientAccounts, PushSender
from vetcare.contexts.notifications.application.services import DevicesService
from vetcare.contexts.notifications.infrastructure.repositories import SqlDeviceRepository
from vetcare.contexts.notifications.infrastructure.senders import (
    ConsolePushSender,
    ExpoPushSender,
)
from vetcare.platform.settings import PushProvider, Settings
from vetcare.platform.unit_of_work import SqlAlchemyUnitOfWork
from vetcare.shared_kernel.clock import Clock, SystemClock


class SqlNotificationsUnitOfWork(SqlAlchemyUnitOfWork):
    devices: SqlDeviceRepository

    async def __aenter__(self) -> "SqlNotificationsUnitOfWork":
        await super().__aenter__()
        self.devices = SqlDeviceRepository(self.session)
        return self


def _uow(
    session_factory: async_sessionmaker[AsyncSession], clock: Clock
) -> Callable[[], SqlNotificationsUnitOfWork]:
    return lambda: SqlNotificationsUnitOfWork(session_factory, clock)


def build_devices(
    session_factory: async_sessionmaker[AsyncSession], *, clock: Clock | None = None
) -> DevicesService:
    real_clock = clock or SystemClock()
    return DevicesService(_uow(session_factory, real_clock), real_clock)


def build_push_sender(settings: Settings) -> PushSender:
    if settings.push_provider is PushProvider.EXPO:
        token = settings.expo_access_token
        return ExpoPushSender(token.get_secret_value() if token else None)
    return ConsolePushSender()


def build_push_handlers(
    session_factory: async_sessionmaker[AsyncSession],
    accounts: ClientAccounts,
    sender: PushSender,
    *,
    clock: Clock | None = None,
) -> list[AppointmentPushHandler]:
    real_clock = clock or SystemClock()
    return [AppointmentPushHandler(_uow(session_factory, real_clock), accounts, sender, real_clock)]
