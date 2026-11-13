"""Registro de los teléfonos donde el cliente recibe avisos."""

from collections.abc import Callable

from vetcare.contexts.identity.public import AuthenticatedUser, Permission
from vetcare.contexts.notifications.application.ports import NotificationsUnitOfWork
from vetcare.contexts.notifications.domain.device import (
    MAX_DEVICES_PER_USER,
    Device,
    DevicePlatform,
    PushToken,
)
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.errors import PermissionDeniedError


def _require(actor: AuthenticatedUser) -> None:
    if not actor.has_permission(Permission.OWN_NOTIFICATIONS_MANAGE):
        raise PermissionDeniedError("Solo los clientes reciben avisos en la app.")


class DevicesService:
    def __init__(self, uow_factory: Callable[[], NotificationsUnitOfWork], clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def register(
        self, actor: AuthenticatedUser, token: str, platform: DevicePlatform
    ) -> None:
        """Idempotente. Si el teléfono estaba en otra cuenta, pasa a la de quien inicia sesión."""
        _require(actor)
        push_token = PushToken(token)
        now = self._clock.now()
        async with self._uow_factory() as uow:
            device = await uow.devices.get(push_token.value)
            if device is None or device.user_id != actor.id:
                device = Device(push_token, actor.id, platform, now, now)
            else:
                device.platform = platform
                device.last_seen_at = now
            await uow.devices.save(device)
            others = [d for d in await uow.devices.of_user(actor.id) if d.token != push_token]
            others.sort(key=lambda d: d.last_seen_at, reverse=True)
            for stale in others[MAX_DEVICES_PER_USER - 1 :]:
                await uow.devices.delete(stale.token.value)
            await uow.commit()

    async def unregister(self, actor: AuthenticatedUser, token: str) -> None:
        """Al cerrar sesión. No revela si el token existía ni de quién era."""
        _require(actor)
        async with self._uow_factory() as uow:
            device = await uow.devices.get(token)
            if device is not None and device.user_id == actor.id:
                await uow.devices.delete(token)
                await uow.commit()
