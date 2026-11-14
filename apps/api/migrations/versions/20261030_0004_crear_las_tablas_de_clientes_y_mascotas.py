"""crear las tablas de clientes y mascotas

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cust_clients",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("document_type", sa.String(length=10), nullable=False),
        sa.Column("document_number", sa.String(length=12), nullable=False),
        sa.Column("phone", sa.String(length=16), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("address", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cust_clients")),
        sa.UniqueConstraint("document_type", "document_number", name="uq_cust_clients_document"),
        sa.UniqueConstraint("email", name=op.f("uq_cust_clients_email")),
        sa.UniqueConstraint("user_id", name=op.f("uq_cust_clients_user_id")),
    )
    op.create_index(op.f("ix_cust_clients_full_name"), "cust_clients", ["full_name"], unique=False)
    op.create_index(op.f("ix_cust_clients_phone"), "cust_clients", ["phone"], unique=False)
    op.create_table(
        "cust_pets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("species", sa.String(length=20), nullable=False),
        sa.Column("sex", sa.String(length=10), nullable=False),
        sa.Column("breed", sa.String(length=60), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("birth_date_approximate", sa.Boolean(), nullable=False),
        sa.Column("color", sa.String(length=60), nullable=True),
        sa.Column("allergies", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cust_pets")),
    )
    op.create_table(
        "cust_guardianships",
        sa.Column("pet_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column(
            "since", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("can_pickup", sa.Boolean(), nullable=False),
        sa.Column("can_book", sa.Boolean(), nullable=False),
        sa.Column("can_view_clinical", sa.Boolean(), nullable=False),
        sa.Column(
            "revoked_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["client_id"], ["cust_clients.id"], name=op.f("fk_cust_guardianships_client_id")
        ),
        sa.ForeignKeyConstraint(
            ["pet_id"], ["cust_pets.id"], name=op.f("fk_cust_guardianships_pet_id")
        ),
        sa.PrimaryKeyConstraint("pet_id", "client_id", "since", name=op.f("pk_cust_guardianships")),
    )
    op.create_index(
        op.f("ix_cust_guardianships_client_id"), "cust_guardianships", ["client_id"], unique=False
    )
    op.create_table(
        "cust_weight_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pet_id", sa.Uuid(), nullable=False),
        sa.Column("kilograms", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column(
            "measured_at",
            sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"),
            nullable=False,
        ),
        sa.Column("recorded_by", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["pet_id"], ["cust_pets.id"], name=op.f("fk_cust_weight_records_pet_id")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cust_weight_records")),
    )
    op.create_index(
        op.f("ix_cust_weight_records_pet_id"), "cust_weight_records", ["pet_id"], unique=False
    )


def downgrade() -> None:
    # DROP TABLE elimina también sus índices (MySQL no permite borrar antes el índice de una FK).
    op.drop_table("cust_weight_records")
    op.drop_table("cust_guardianships")
    op.drop_table("cust_pets")
    op.drop_table("cust_clients")
