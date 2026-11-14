from sqlalchemy import Column, DateTime, String, Table, Uuid
from sqlalchemy.dialects import mysql

from vetcare.platform.db import metadata

_TS = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

devices = Table(
    "ntf_devices",
    metadata,
    # El token de Expo identifica al teléfono. Solo sirve para enviarle avisos a través del
    # proyecto de Expo de VetCare, pero igual no se expone en ninguna respuesta.
    Column("token", String(200), primary_key=True),
    Column("user_id", Uuid, nullable=False, index=True),
    Column("platform", String(10), nullable=False),
    Column("registered_at", _TS, nullable=False),
    Column("last_seen_at", _TS, nullable=False),
)
