from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Uuid,
)
from sqlalchemy.dialects import mysql

from vetcare.platform.db import metadata

_TS = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

appointments = Table(
    "sch_appointments",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("pet_id", Uuid, nullable=False, index=True),
    Column("pet_name", String(60), nullable=False),
    Column("client_id", Uuid, nullable=False, index=True),
    Column("service_type_id", Uuid, nullable=False),
    Column("service_name", String(100), nullable=False),
    Column("start_at", _TS, nullable=False, index=True),
    Column("end_at", _TS, nullable=False),
    Column("status", String(20), nullable=False),
    Column("channel", String(10), nullable=False),
    Column("reason", String(500), nullable=True),
    Column("notes", String(1000), nullable=True),
    Column("cancellation_reason", String(300), nullable=True),
    Column("created_by", Uuid, nullable=False),
    Column("created_at", _TS, nullable=False),
    Column("version", Integer, nullable=False),
)

# Ocupación por recurso, copiada de la cita para consultar solapes con un índice.
appointment_resources = Table(
    "sch_appointment_resources",
    metadata,
    Column("appointment_id", Uuid, ForeignKey("sch_appointments.id"), primary_key=True),
    Column("resource_id", Uuid, primary_key=True),
    Column("start_at", _TS, nullable=False),
    Column("end_at", _TS, nullable=False),
    Column("active", Boolean, nullable=False),
    Index("ix_sch_appointment_resources_busy", "resource_id", "active", "start_at"),
)

appointment_history = Table(
    "sch_appointment_history",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("appointment_id", Uuid, ForeignKey("sch_appointments.id"), nullable=False, index=True),
    Column("at", _TS, nullable=False),
    Column("by", Uuid, nullable=False),
    Column("action", String(20), nullable=False),
    Column("start_at", _TS, nullable=False),
    Column("end_at", _TS, nullable=False),
    Column("note", String(300), nullable=True),
)

# Una fila por recurso agendable: se bloquea con SELECT … FOR UPDATE durante cada reserva.
resource_locks = Table(
    "sch_resource_locks",
    metadata,
    Column("resource_id", Uuid, primary_key=True),
)

idempotency_keys = Table(
    "sch_idempotency_keys",
    metadata,
    Column("user_id", Uuid, primary_key=True),
    Column("key", String(100), primary_key=True),
    Column("request_hash", String(64), nullable=False),
    Column("appointment_id", Uuid, nullable=False),
    Column("created_at", _TS, nullable=False),
)
