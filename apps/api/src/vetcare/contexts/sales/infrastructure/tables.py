from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Uuid,
)
from sqlalchemy.dialects import mysql

from vetcare.platform.db import metadata

_TS = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")
_MONEY = Numeric(10, 2)

products = Table(
    "sal_products",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("name", String(120), nullable=False, index=True),
    Column("sku", String(40), nullable=True),
    Column("category", String(20), nullable=False),
    Column("unit", String(20), nullable=False),
    Column("cost_price", _MONEY, nullable=False),
    Column("sale_price", _MONEY, nullable=False),
    Column("stock", _MONEY, nullable=False),
    Column("min_stock", _MONEY, nullable=False),
    Column("active", Boolean, nullable=False),
    Column("created_at", _TS, nullable=False),
    Column("version", Integer, nullable=False),
)

stock_movements = Table(
    "sal_stock_movements",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("product_id", Uuid, ForeignKey("sal_products.id"), nullable=False),
    Column("at", _TS, nullable=False),
    Column("by", Uuid, nullable=False),
    Column("kind", String(20), nullable=False),
    Column("quantity", _MONEY, nullable=False),
    Column("stock_after", _MONEY, nullable=False),
    Column("unit_cost", _MONEY, nullable=True),
    Column("note", String(200), nullable=True),
    Column("charge_id", Uuid, nullable=True),
    Index("ix_sal_stock_movements_product", "product_id", "at"),
)

charges = Table(
    "sal_charges",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("at", _TS, nullable=False, index=True),
    Column("by", Uuid, nullable=False),
    Column("method", String(20), nullable=False),
    Column("status", String(20), nullable=False),
    Column("total", _MONEY, nullable=False),
    Column("client_id", Uuid, nullable=True),
    Column("customer_name", String(150), nullable=True),
    Column("pet_name", String(60), nullable=True),
    Column("appointment_id", Uuid, nullable=True),
    Column("notes", String(500), nullable=True),
    Column("voided_at", _TS, nullable=True),
    Column("voided_by", Uuid, nullable=True),
    Column("void_reason", String(300), nullable=True),
    Column("version", Integer, nullable=False),
)

charge_lines = Table(
    "sal_charge_lines",
    metadata,
    Column("charge_id", Uuid, ForeignKey("sal_charges.id"), primary_key=True),
    Column("position", Integer, primary_key=True),
    Column("kind", String(20), nullable=False),
    Column("description", String(150), nullable=False),
    Column("quantity", _MONEY, nullable=False),
    Column("unit_price", _MONEY, nullable=False),
    Column("unit_cost", _MONEY, nullable=False),
    Column("product_id", Uuid, nullable=True),
    Column("service_type_id", Uuid, nullable=True),
)
