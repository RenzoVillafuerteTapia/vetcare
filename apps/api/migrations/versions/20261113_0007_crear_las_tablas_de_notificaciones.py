"""crear las tablas de notificaciones y del despacho del outbox

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TS = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    op.create_table(
        "outbox_cursors",
        sa.Column("handler", sa.String(length=80), nullable=False),
        sa.Column("position", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("handler", name=op.f("pk_outbox_cursors")),
    )
    op.create_table(
        "outbox_deliveries",
        sa.Column("handler", sa.String(length=80), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", _TS, nullable=False),
        sa.Column("last_error", sa.String(length=300), nullable=True),
        sa.Column("updated_at", _TS, nullable=False),
        sa.PrimaryKeyConstraint("handler", "event_id", name=op.f("pk_outbox_deliveries")),
    )
    op.create_index("ix_outbox_deliveries_due", "outbox_deliveries", ["status", "next_attempt_at"])
    op.create_table(
        "ntf_devices",
        sa.Column("token", sa.String(length=200), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("platform", sa.String(length=10), nullable=False),
        sa.Column("registered_at", _TS, nullable=False),
        sa.Column("last_seen_at", _TS, nullable=False),
        sa.PrimaryKeyConstraint("token", name=op.f("pk_ntf_devices")),
    )
    op.create_index(op.f("ix_ntf_devices_user_id"), "ntf_devices", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_ntf_devices_user_id"), table_name="ntf_devices")
    op.drop_table("ntf_devices")
    op.drop_index("ix_outbox_deliveries_due", table_name="outbox_deliveries")
    op.drop_table("outbox_deliveries")
    op.drop_table("outbox_cursors")
