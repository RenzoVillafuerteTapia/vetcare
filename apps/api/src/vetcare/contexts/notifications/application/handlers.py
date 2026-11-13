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
    appointment_push,
)
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.events import StoredEvent

logger = logging.getLogger(__name__)

# Un aviso que llega tarde confunde más de lo que ayuda (p. ej. al procesar eventos antiguos
# la primera vez que arranca el worker, o tras una caída larga).
MAX_NOTICE_AGE = timedelta(hours=12)


class AppointmentPushHandler:
    """Avisa al cliente cuando la clínica confirma, reprograma o cancela su cita."""

    name = "notifications.appointment_push"
    event_types = frozenset({APPOINTMENT_CONFIRMED, APPOINTMENT_RESCHEDULED, APPOINTMENT_CANCELLED})

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

    async def handle(self, event: StoredEvent) -> None:
        now = self._clock.now()
        start = datetime.fromisoformat(str(event.payload["start"]))
        if now - event.occurred_at > MAX_NOTICE_AGE or start <= now:
            return
        content = appointment_push(
            event.event_type, str(event.aggregate_id), event.payload, start.astimezone(CLINIC_TZ)
        )
        if content is None:
            return
        user_id = await self._accounts.user_id_of_client(UUID(str(event.payload["client_id"])))
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
