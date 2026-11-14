from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Table, Uuid
from sqlalchemy.dialects import mysql

from vetcare.platform.db import metadata

_TS = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

tracked_services = Table(
    "trk_services",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("appointment_id", Uuid, nullable=False, unique=True),
    Column("pet_id", Uuid, nullable=False, index=True),
    Column("pet_name", String(60), nullable=False),
    Column("client_id", Uuid, nullable=False),
    Column("service_name", String(100), nullable=False),
    Column("template", String(20), nullable=False),
    # Etapas copiadas de la plantilla al iniciar: [{"code": ..., "label": ...}].
    Column("stages", JSON, nullable=False),
    Column("current_index", Integer, nullable=False),
    Column("status", String(20), nullable=False),
    Column("started_at", _TS, nullable=False),
    Column("updated_at", _TS, nullable=False, index=True),
    Column("version", Integer, nullable=False),
)

timeline = Table(
    "trk_timeline",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("service_id", Uuid, ForeignKey("trk_services.id"), nullable=False, index=True),
    Column("at", _TS, nullable=False),
    Column("by", Uuid, nullable=False),
    Column("kind", String(20), nullable=False),
    Column("stage_index", Integer, nullable=True),
    Column("text", String(500), nullable=True),
)
