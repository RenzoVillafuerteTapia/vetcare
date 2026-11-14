"""Despacho del outbox a sus manejadores (ADR 0003).

Cada manejador avanza su propio cursor sobre ``outbox_events``. Por cada evento que le interesa
se guarda una entrega ``(handler, event_id)``: esa clave evita procesarlo dos veces aunque el
worker se reinicie. Las entregas fallidas se reintentan con espera exponencial hasta un máximo;
después quedan en ``failed`` para revisión.

Se asume **un solo worker** a la vez: el cursor se bloquea con ``FOR UPDATE``, pero las entregas
pendientes no se reparten entre procesos.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Table,
    Uuid,
    insert,
    select,
    update,
)
from sqlalchemy.dialects import mysql
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.platform.db import metadata
from vetcare.platform.outbox import outbox_events
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.events import EventHandler, RetryLaterError, StoredEvent

logger = logging.getLogger(__name__)

_TS = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

outbox_cursors = Table(
    "outbox_cursors",
    metadata,
    Column("handler", String(80), primary_key=True),
    Column("position", BigInteger, nullable=False),
)

outbox_deliveries = Table(
    "outbox_deliveries",
    metadata,
    Column("handler", String(80), primary_key=True),
    Column("event_id", Uuid, primary_key=True),
    Column("position", BigInteger, nullable=False),
    Column("status", String(10), nullable=False),
    Column("attempts", Integer, nullable=False),
    Column("next_attempt_at", _TS, nullable=False),
    Column("last_error", String(300), nullable=True),
    Column("updated_at", _TS, nullable=False),
    Index("ix_outbox_deliveries_due", "status", "next_attempt_at"),
)


class DeliveryStatus(StrEnum):
    PENDING = "pending"
    DELIVERED = "delivered"
    FAILED = "failed"


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 6
    # 30 s, 1 min, 2 min, 4 min, 8 min: unos 15 minutos en total antes de darse por vencido.
    base_delay: timedelta = timedelta(seconds=30)
    max_delay: timedelta = timedelta(minutes=30)

    def delay(self, attempts: int) -> timedelta:
        return min(self.base_delay * (1 << (attempts - 1)), self.max_delay)


@dataclass(frozen=True)
class DispatchResult:
    scheduled: int = 0
    delivered: int = 0
    retried: int = 0
    failed: int = 0


def _naive(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class OutboxDispatcher:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        handlers: Sequence[EventHandler],
        clock: Clock,
        *,
        retry: RetryPolicy | None = None,
        batch_size: int = 200,
    ) -> None:
        names = [h.name for h in handlers]
        if len(set(names)) != len(names):
            raise ValueError("Cada manejador del outbox necesita un nombre único.")
        self._session_factory = session_factory
        self._handlers = {h.name: h for h in handlers}
        self._clock = clock
        self._retry = retry or RetryPolicy()
        self._batch_size = batch_size

    async def run_once(self) -> DispatchResult:
        """Programa las entregas nuevas y procesa las que ya tocan. Devuelve lo que hizo."""
        scheduled = 0
        for handler in self._handlers.values():
            scheduled += await self._schedule(handler)
        delivered = retried = failed = 0
        for handler_name, event in await self._due():
            outcome = await self._deliver(self._handlers[handler_name], event)
            delivered += outcome is DeliveryStatus.DELIVERED
            failed += outcome is DeliveryStatus.FAILED
            retried += outcome is DeliveryStatus.PENDING
        return DispatchResult(scheduled, delivered, retried, failed)

    async def _schedule(self, handler: EventHandler) -> int:
        now = _naive(self._clock.now())
        async with self._session_factory() as session, session.begin():
            cursor = (
                await session.execute(
                    select(outbox_cursors.c.position)
                    .where(outbox_cursors.c.handler == handler.name)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if cursor is None:
                await session.execute(
                    insert(outbox_cursors).values(handler=handler.name, position=0)
                )
                cursor = 0
            rows = (
                await session.execute(
                    select(
                        outbox_events.c.position,
                        outbox_events.c.event_id,
                        outbox_events.c.event_type,
                    )
                    .where(outbox_events.c.position > cursor)
                    .order_by(outbox_events.c.position)
                    .limit(self._batch_size)
                )
            ).all()
            if not rows:
                return 0
            wanted = [
                {
                    "handler": handler.name,
                    "event_id": row.event_id,
                    "position": row.position,
                    "status": DeliveryStatus.PENDING.value,
                    "attempts": 0,
                    "next_attempt_at": now,
                    "updated_at": now,
                }
                for row in rows
                if row.event_type in handler.event_types
            ]
            if wanted:
                await session.execute(insert(outbox_deliveries), wanted)
            await session.execute(
                update(outbox_cursors)
                .where(outbox_cursors.c.handler == handler.name)
                .values(position=rows[-1].position)
            )
        return len(wanted)

    async def _due(self) -> list[tuple[str, StoredEvent]]:
        now = _naive(self._clock.now())
        d, e = outbox_deliveries, outbox_events
        async with self._session_factory() as session:
            rows = (
                await session.execute(
                    select(d.c.handler, e)
                    .join(e, e.c.event_id == d.c.event_id)
                    .where(
                        d.c.status == DeliveryStatus.PENDING.value,
                        d.c.next_attempt_at <= now,
                        d.c.handler.in_(list(self._handlers)),
                    )
                    .order_by(d.c.position)
                    .limit(self._batch_size)
                )
            ).all()
        return [
            (
                row.handler,
                StoredEvent(
                    position=row.position,
                    event_id=row.event_id,
                    event_type=row.event_type,
                    schema_version=row.schema_version,
                    aggregate_type=row.aggregate_type,
                    aggregate_id=row.aggregate_id,
                    occurred_at=_aware(row.occurred_at),
                    payload=row.payload,
                ),
            )
            for row in rows
        ]

    async def _deliver(self, handler: EventHandler, event: StoredEvent) -> DeliveryStatus:
        error: str | None = None
        try:
            await handler.handle(event)
        except RetryLaterError as exc:
            error = str(exc) or "Reintentar más tarde"
            logger.warning("%s: %s (evento %s)", handler.name, error, event.event_id)
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            logger.exception("%s falló con el evento %s", handler.name, event.event_id)

        now = self._clock.now()
        d = outbox_deliveries
        key = (d.c.handler == handler.name) & (d.c.event_id == event.event_id)
        async with self._session_factory() as session, session.begin():
            if error is None:
                await session.execute(
                    update(d)
                    .where(key)
                    .values(
                        status=DeliveryStatus.DELIVERED.value,
                        attempts=d.c.attempts + 1,
                        last_error=None,
                        updated_at=_naive(now),
                    )
                )
                return DeliveryStatus.DELIVERED
            attempts = (
                await session.execute(select(d.c.attempts).where(key).with_for_update())
            ).scalar_one() + 1
            status = (
                DeliveryStatus.FAILED
                if attempts >= self._retry.max_attempts
                else DeliveryStatus.PENDING
            )
            await session.execute(
                update(d)
                .where(key)
                .values(
                    status=status.value,
                    attempts=attempts,
                    next_attempt_at=_naive(now + self._retry.delay(attempts)),
                    last_error=error[:300],
                    updated_at=_naive(now),
                )
            )
        if status is DeliveryStatus.FAILED:
            logger.error("%s: el evento %s quedó en 'failed'", handler.name, event.event_id)
        return status
