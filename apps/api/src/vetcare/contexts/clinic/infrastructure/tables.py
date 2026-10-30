from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Uuid,
)
from sqlalchemy.dialects import mysql

from vetcare.platform.db import metadata

_TS = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

# Fila única del calendario de la sede (hay una sola sede).
CALENDAR_ROW_ID = 1

service_types = Table(
    "clinic_service_types",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("code", String(40), nullable=False, unique=True),
    Column("name", String(100), nullable=False),
    Column("category", String(30), nullable=False),
    Column("duration_minutes", Integer, nullable=False),
    Column("required_resources", JSON, nullable=False),
    Column("bookable_by_client", Boolean, nullable=False),
    Column("description", String(500), nullable=False),
    Column("active", Boolean, nullable=False),
    Column("version", Integer, nullable=False),
)

resources = Table(
    "clinic_resources",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("kind", String(30), nullable=False, index=True),
    Column("name", String(100), nullable=False),
    Column("user_id", Uuid, nullable=True),
    Column("active", Boolean, nullable=False),
    # Horario semanal en hora local: [{"weekday": 0, "start": "09:00", "end": "13:00"}, ...]
    Column("schedule", JSON, nullable=False),
    Column("version", Integer, nullable=False),
)

resource_time_off = Table(
    "clinic_resource_time_off",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("resource_id", Uuid, ForeignKey("clinic_resources.id"), nullable=False, index=True),
    Column("start_at", _TS, nullable=False),
    Column("end_at", _TS, nullable=False),
    Column("reason", String(200), nullable=False),
)

calendar = Table(
    "clinic_calendar",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=False),
    Column("opening_hours", JSON, nullable=False),
    Column("version", Integer, nullable=False),
)

holidays = Table(
    "clinic_holidays",
    metadata,
    Column("day", Date, primary_key=True),
    Column("name", String(100), nullable=False),
)
