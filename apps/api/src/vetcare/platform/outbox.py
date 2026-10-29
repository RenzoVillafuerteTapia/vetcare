"""Outbox transaccional (ADR 0003).

Los eventos de dominio se guardan en la misma transacción que el cambio de estado.
"""

import dataclasses
import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    Column,
    DateTime,
    Integer,
    String,
    Table,
    Uuid,
)
from sqlalchemy.dialects import mysql

from vetcare.platform.db import metadata
from vetcare.shared_kernel.domain import DomainEvent

_PRECISE_DATETIME = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

_ENVELOPE_FIELDS = {"event_id", "aggregate_id", "occurred_at"}

outbox_events = Table(
    "outbox_events",
    metadata,
    # Posición global y creciente: ordena el despacho y sirve como Last-Event-ID en SSE.
    Column("position", BigInteger, primary_key=True, autoincrement=True),
    Column("event_id", Uuid, nullable=False, unique=True),
    Column("event_type", String(120), nullable=False),
    Column("schema_version", Integer, nullable=False),
    Column("aggregate_type", String(80), nullable=False),
    Column("aggregate_id", Uuid, nullable=False, index=True),
    Column("occurred_at", _PRECISE_DATETIME, nullable=False),
    Column("payload", JSON, nullable=False),
    Column("recorded_at", _PRECISE_DATETIME, nullable=False),
)


def _to_json(value: Any) -> Any:
    if isinstance(value, UUID | Decimal):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, enum.Enum):
        return _to_json(value.value)
    if isinstance(value, list | tuple | set | frozenset):
        return [_to_json(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _to_json(v) for k, v in value.items()}
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {f.name: _to_json(getattr(value, f.name)) for f in dataclasses.fields(value)}
    return value


def event_payload(event: DomainEvent) -> dict[str, Any]:
    """Campos propios del evento, sin los del sobre (id, agregado y momento)."""
    return {
        f.name: _to_json(getattr(event, f.name))
        for f in dataclasses.fields(event)
        if f.name not in _ENVELOPE_FIELDS
    }


def outbox_row(event: DomainEvent, aggregate_type: str, recorded_at: datetime) -> dict[str, Any]:
    return {
        "event_id": event.event_id,
        "event_type": event.event_type,
        "schema_version": event.schema_version,
        "aggregate_type": aggregate_type,
        "aggregate_id": event.aggregate_id,
        "occurred_at": event.occurred_at,
        "payload": event_payload(event),
        "recorded_at": recorded_at,
    }
