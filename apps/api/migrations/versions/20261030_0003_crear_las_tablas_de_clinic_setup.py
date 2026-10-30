"""crear las tablas de clinic setup

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "clinic_calendar",
        sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("opening_hours", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clinic_calendar")),
    )
    op.create_table(
        "clinic_holidays",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("day", name=op.f("pk_clinic_holidays")),
    )
    op.create_table(
        "clinic_resources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("schedule", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clinic_resources")),
    )
    op.create_index(op.f("ix_clinic_resources_kind"), "clinic_resources", ["kind"], unique=False)
    op.create_table(
        "clinic_service_types",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("required_resources", sa.JSON(), nullable=False),
        sa.Column("bookable_by_client", sa.Boolean(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clinic_service_types")),
        sa.UniqueConstraint("code", name=op.f("uq_clinic_service_types_code")),
    )
    op.create_table(
        "clinic_resource_time_off",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column(
            "start_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "end_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["clinic_resources.id"],
            name=op.f("fk_clinic_resource_time_off_resource_id"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clinic_resource_time_off")),
    )
    op.create_index(
        op.f("ix_clinic_resource_time_off_resource_id"),
        "clinic_resource_time_off",
        ["resource_id"],
        unique=False,
    )


def downgrade() -> None:
    # DROP TABLE elimina también sus índices (MySQL no permite borrar antes el índice de una FK).
    op.drop_table("clinic_resource_time_off")
    op.drop_table("clinic_resources")
    op.drop_table("clinic_service_types")
    op.drop_table("clinic_holidays")
    op.drop_table("clinic_calendar")
