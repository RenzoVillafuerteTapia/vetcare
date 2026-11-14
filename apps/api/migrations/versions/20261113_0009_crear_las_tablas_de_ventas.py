"""crear las tablas de ventas: productos, stock y cobros

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TS = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")
_MONEY = sa.Numeric(10, 2)


def upgrade() -> None:
    op.create_table(
        "sal_products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("sku", sa.String(length=40), nullable=True),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("cost_price", _MONEY, nullable=False),
        sa.Column("sale_price", _MONEY, nullable=False),
        sa.Column("stock", _MONEY, nullable=False),
        sa.Column("min_stock", _MONEY, nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", _TS, nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sal_products")),
    )
    op.create_index(op.f("ix_sal_products_name"), "sal_products", ["name"])
    op.create_table(
        "sal_stock_movements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("at", _TS, nullable=False),
        sa.Column("by", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("quantity", _MONEY, nullable=False),
        sa.Column("stock_after", _MONEY, nullable=False),
        sa.Column("unit_cost", _MONEY, nullable=True),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("charge_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["product_id"], ["sal_products.id"], name=op.f("fk_sal_stock_movements_product_id")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sal_stock_movements")),
    )
    op.create_index("ix_sal_stock_movements_product", "sal_stock_movements", ["product_id", "at"])
    op.create_table(
        "sal_charges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("at", _TS, nullable=False),
        sa.Column("by", sa.Uuid(), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("total", _MONEY, nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=True),
        sa.Column("customer_name", sa.String(length=150), nullable=True),
        sa.Column("pet_name", sa.String(length=60), nullable=True),
        sa.Column("appointment_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("voided_at", _TS, nullable=True),
        sa.Column("voided_by", sa.Uuid(), nullable=True),
        sa.Column("void_reason", sa.String(length=300), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sal_charges")),
    )
    op.create_index(op.f("ix_sal_charges_at"), "sal_charges", ["at"])
    op.create_table(
        "sal_charge_lines",
        sa.Column("charge_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("description", sa.String(length=150), nullable=False),
        sa.Column("quantity", _MONEY, nullable=False),
        sa.Column("unit_price", _MONEY, nullable=False),
        sa.Column("unit_cost", _MONEY, nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=True),
        sa.Column("service_type_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["charge_id"], ["sal_charges.id"], name=op.f("fk_sal_charge_lines_charge_id")
        ),
        sa.PrimaryKeyConstraint("charge_id", "position", name=op.f("pk_sal_charge_lines")),
    )


def downgrade() -> None:
    # Borrar cada tabla borra también sus índices (MySQL no deja borrar antes el de una FK).
    op.drop_table("sal_charge_lines")
    op.drop_table("sal_charges")
    op.drop_table("sal_stock_movements")
    op.drop_table("sal_products")
