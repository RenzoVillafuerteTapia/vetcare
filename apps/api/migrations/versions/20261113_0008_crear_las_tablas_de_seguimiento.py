"""crear las tablas del seguimiento de servicios

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TS = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    op.create_table(
        "trk_services",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("appointment_id", sa.Uuid(), nullable=False),
        sa.Column("pet_id", sa.Uuid(), nullable=False),
        sa.Column("pet_name", sa.String(length=60), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("service_name", sa.String(length=100), nullable=False),
        sa.Column("template", sa.String(length=20), nullable=False),
        sa.Column("stages", sa.JSON(), nullable=False),
        sa.Column("current_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", _TS, nullable=False),
        sa.Column("updated_at", _TS, nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trk_services")),
        sa.UniqueConstraint("appointment_id", name=op.f("uq_trk_services_appointment_id")),
    )
    op.create_index(op.f("ix_trk_services_pet_id"), "trk_services", ["pet_id"])
    op.create_index(op.f("ix_trk_services_updated_at"), "trk_services", ["updated_at"])
    op.create_table(
        "trk_timeline",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("at", _TS, nullable=False),
        sa.Column("by", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("stage_index", sa.Integer(), nullable=True),
        sa.Column("text", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["trk_services.id"],
            name=op.f("fk_trk_timeline_service_id"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trk_timeline")),
    )
    op.create_index(op.f("ix_trk_timeline_service_id"), "trk_timeline", ["service_id"])


def downgrade() -> None:
    # Borrar la tabla también borra su índice (MySQL no deja borrarlo antes que la clave foránea).
    op.drop_table("trk_timeline")
    op.drop_index(op.f("ix_trk_services_updated_at"), table_name="trk_services")
    op.drop_index(op.f("ix_trk_services_pet_id"), table_name="trk_services")
    op.drop_table("trk_services")
