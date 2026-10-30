from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects import mysql

from vetcare.platform.db import metadata

_TS = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

clients = Table(
    "cust_clients",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("full_name", String(150), nullable=False, index=True),
    Column("document_type", String(10), nullable=False),
    Column("document_number", String(12), nullable=False),
    Column("phone", String(16), nullable=False, index=True),
    Column("email", String(254), nullable=True, unique=True),
    Column("address", String(200), nullable=True),
    Column("notes", Text, nullable=True),
    Column("user_id", Uuid, nullable=True, unique=True),
    Column("created_at", _TS, nullable=False),
    Column("version", Integer, nullable=False),
    UniqueConstraint("document_type", "document_number", name="uq_cust_clients_document"),
)

pets = Table(
    "cust_pets",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("name", String(60), nullable=False),
    Column("species", String(20), nullable=False),
    Column("sex", String(10), nullable=False),
    Column("breed", String(60), nullable=True),
    Column("birth_date", Date, nullable=True),
    Column("birth_date_approximate", Boolean, nullable=False),
    Column("color", String(60), nullable=True),
    Column("allergies", Text, nullable=True),
    Column("notes", Text, nullable=True),
    Column("status", String(20), nullable=False),
    Column("created_at", _TS, nullable=False),
    Column("version", Integer, nullable=False),
)

# Historial completo: las tutelas revocadas se conservan con revoked_at.
guardianships = Table(
    "cust_guardianships",
    metadata,
    Column("pet_id", Uuid, ForeignKey("cust_pets.id"), primary_key=True),
    Column("client_id", Uuid, ForeignKey("cust_clients.id"), primary_key=True, index=True),
    Column("since", _TS, primary_key=True),
    Column("kind", String(20), nullable=False),
    Column("can_pickup", Boolean, nullable=False),
    Column("can_book", Boolean, nullable=False),
    Column("can_view_clinical", Boolean, nullable=False),
    Column("revoked_at", _TS, nullable=True),
)

weight_records = Table(
    "cust_weight_records",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("pet_id", Uuid, ForeignKey("cust_pets.id"), nullable=False, index=True),
    Column("kilograms", Numeric(5, 2), nullable=False),
    Column("measured_at", _TS, nullable=False),
    Column("recorded_by", Uuid, nullable=False),
)
