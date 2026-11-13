"""Manejadores del outbox que envían avisos push (ADR 0003 y 0004)."""

import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from uuid import UUID

from vetcare.contexts.clinic.public import CLINIC_TZ
from vetcare.contexts.notifications.application.ports import (
    ClientAccounts,
    NotificationsUnitOfWork,
    PushMessage,
    PushSender,
)
from vetcare.contexts.notifications.domain.messages import (
    APPOINTMENT_CANCELLED,
    APPOINTMENT_CONFIRMED,
    APPOINTMENT_RESCHEDULED,
    TRACKING_STAGE_CHANGED,
    TRACKING_STARTED,
    TRACKING_UPDATE_PUBLISHED,
    PushContent,
    appointment_push,
    tracking_push,
)
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.events import StoredEvent

logger = logging.getLogger(__name__)

# Un aviso que llega tarde confunde más de lo que ayuda (p. ej. al procesar eventos antiguos
# la primera vez que arranca el worker, o tras una caída larga).
MAX_NOTICE_AGE = timedelta(hours=12)


class _PushHandler:
    """Envía un aviso a todos los teléfonos de la cuenta del cliente."""

    def __init__(
        self,
        uow_factory: Callable[[], NotificationsUnitOfWork],
        accounts: ClientAccounts,
        sender: PushSender,
        clock: Clock,
    ) -> None:
        self._uow_factory = uow_factory
        self._accounts = accounts
        self._sender = sender
        self._clock = clock

    def _stale(self, event: StoredEvent) -> bool:
        return self._clock.now() - event.occurred_at > MAX_NOTICE_AGE

    async def _notify(self, client_id: UUID, content: PushContent) -> None:
        user_id = await self._accounts.user_id_of_client(client_id)
        if user_id is None:
            return  # El cliente no usa la app.
        async with self._uow_factory() as uow:
            devices = await uow.devices.of_user(user_id)
        if not devices:
            return
        tickets = await self._sender.send(
            [
                PushMessage(d.token.value, content.title, content.body, dict(content.data))
                for d in devices
            ]
        )
        gone = [t.token for t in tickets if t.unregistered]
        for ticket in tickets:
            if not ticket.ok and not ticket.unregistered:
                logger.warning("Aviso no aceptado por el proveedor: %s", ticket.error)
        if gone:
            async with self._uow_factory() as uow:
                for token in gone:
                    await uow.devices.delete(token)
                await uow.commit()


class AppointmentPushHandler(_PushHandler):
    """Avisa al cliente cuando la clínica confirma, reprograma o cancela su cita."""

    name = "notifications.appointment_push"
    event_types = frozenset({APPOINTMENT_CONFIRMED, APPOINTMENT_RESCHEDULED, APPOINTMENT_CANCELLED})

    async def handle(self, event: StoredEvent) -> None:
        start = datetime.fromisoformat(str(event.payload["start"]))
        if self._stale(event) or start <= self._clock.now():
            return
        content = appointment_push(
            event.event_type, str(event.aggregate_id), event.payload, start.astimezone(CLINIC_TZ)
        )
        if content is not None:
            await self._notify(UUID(str(event.payload["client_id"])), content)


class TrackingPushHandler(_PushHandler):
    """Avisa al cliente cuando empieza la atención, cuando su mascota está lista (o tiene el
    alta) y cuando la clínica publica un avance."""

    name = "notifications.tracking_push"
    event_types = frozenset({TRACKING_STARTED, TRACKING_STAGE_CHANGED, TRACKING_UPDATE_PUBLISHED})

    async def handle(self, event: StoredEvent) -> None:
        if self._stale(event):
            return
        content = tracking_push(event.event_type, str(event.aggregate_id), event.payload)
        if content is not None:
            await self._notify(UUID(str(event.payload["client_id"])), content)
