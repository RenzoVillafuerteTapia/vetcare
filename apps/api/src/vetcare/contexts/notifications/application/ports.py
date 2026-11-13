from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol
from uuid import UUID

from vetcare.contexts.notifications.domain.device import Device
from vetcare.shared_kernel.application import UnitOfWork


class DeviceRepository(Protocol):
    async def get(self, token: str) -> Device | None: ...

    async def of_user(self, user_id: UUID) -> list[Device]: ...

    async def save(self, device: Device) -> None: ...

    async def delete(self, token: str) -> None: ...


class NotificationsUnitOfWork(UnitOfWork, Protocol):
    @property
    def devices(self) -> DeviceRepository: ...


@dataclass(frozen=True)
class PushMessage:
    to: str
    title: str
    body: str
    data: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class PushTicket:
    """Resultado de un mensaje. ``unregistered``: el teléfono ya no acepta avisos (la app se
    desinstaló o se quitó el permiso) y el token debe olvidarse."""

    token: str
    ok: bool
    unregistered: bool = False
    error: str | None = None


class PushSender(Protocol):
    """Envía avisos push. Lanza ``RetryLaterError`` si el proveedor no está disponible."""

    async def send(self, messages: Sequence[PushMessage]) -> list[PushTicket]: ...


class ClientAccounts(Protocol):
    """Customers & Pets: la cuenta de la app vinculada a un cliente."""

    async def user_id_of_client(self, client_id: UUID) -> UUID | None: ...
