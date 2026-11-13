"""Eventos ya guardados en el outbox, tal como los recibe un manejador del worker (ADR 0003)."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol
from uuid import UUID


@dataclass(frozen=True)
class StoredEvent:
    position: int
    event_id: UUID
    event_type: str
    schema_version: int
    aggregate_type: str
    aggregate_id: UUID
    occurred_at: datetime
    payload: Mapping[str, Any]


class RetryLaterError(Exception):
    """Falla pasajera (red, proveedor caído, límite de envíos): el worker reintenta más tarde."""


class EventHandler(Protocol):
    """Un suscriptor del outbox. Debe ser idempotente: la entrega es *al menos una vez*.

    ``name`` es estable: junto con el id del evento forma la clave de deduplicación.
    Lanzar ``RetryLaterError`` (o cualquier otra excepción) programa un reintento.
    """

    name: str
    event_types: frozenset[str]

    async def handle(self, event: StoredEvent) -> None: ...
