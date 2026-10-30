"""crear las tablas de la agenda

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sch_appointments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pet_id", sa.Uuid(), nullable=False),
        sa.Column("pet_name", sa.String(length=60), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("service_type_id", sa.Uuid(), nullable=False),
        sa.Column("service_name", sa.String(length=100), nullable=False),
        sa.Column(
            "start_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "end_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("cancellation_reason", sa.String(length=300), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sch_appointments")),
    )
    op.create_index(
        op.f("ix_sch_appointments_client_id"), "sch_appointments", ["client_id"], unique=False
    )
    op.create_index(
        op.f("ix_sch_appointments_pet_id"), "sch_appointments", ["pet_id"], unique=False
    )
    op.create_index(
        op.f("ix_sch_appointments_start_at"), "sch_appointments", ["start_at"], unique=False
    )
    op.create_table(
        "sch_idempotency_keys",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("appointment_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id", "key", name=op.f("pk_sch_idempotency_keys")),
    )
    op.create_table(
        "sch_resource_locks",
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("resource_id", name=op.f("pk_sch_resource_locks")),
    )
    op.create_table(
        "sch_appointment_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("appointment_id", sa.Uuid(), nullable=False),
        sa.Column("at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False),
        sa.Column("by", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column(
            "start_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "end_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(
            ["appointment_id"],
            ["sch_appointments.id"],
            name=op.f("fk_sch_appointment_history_appointment_id"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sch_appointment_history")),
    )
    op.create_index(
        op.f("ix_sch_appointment_history_appointment_id"),
        "sch_appointment_history",
        ["appointment_id"],
        unique=False,
    )
    op.create_table(
        "sch_appointment_resources",
        sa.Column("appointment_id", sa.Uuid(), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column(
            "start_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "end_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["appointment_id"],
            ["sch_appointments.id"],
            name=op.f("fk_sch_appointment_resources_appointment_id"),
        ),
        sa.PrimaryKeyConstraint(
            "appointment_id", "resource_id", name=op.f("pk_sch_appointment_resources")
        ),
    )
    op.create_index(
        "ix_sch_appointment_resources_busy",
        "sch_appointment_resources",
        ["resource_id", "active", "start_at"],
        unique=False,
    )


def downgrade() -> None:
    # DROP TABLE elimina también sus índices (MySQL no permite borrar antes el índice de una FK).
    op.drop_table("sch_idempotency_keys")
    op.drop_table("sch_resource_locks")
    op.drop_table("sch_appointment_history")
    op.drop_table("sch_appointment_resources")
    op.drop_table("sch_appointments")
