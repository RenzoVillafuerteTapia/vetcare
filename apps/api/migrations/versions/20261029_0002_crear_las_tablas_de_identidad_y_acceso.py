"""crear las tablas de identidad y acceso

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "iam_audit_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("target_type", sa.String(length=60), nullable=True),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_iam_audit_log")),
    )
    op.create_index(op.f("ix_iam_audit_log_actor_id"), "iam_audit_log", ["actor_id"], unique=False)
    op.create_index(
        op.f("ix_iam_audit_log_occurred_at"), "iam_audit_log", ["occurred_at"], unique=False
    )
    op.create_table(
        "iam_users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("roles", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False),
        sa.Column(
            "locked_until",
            sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "activated_at",
            sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"),
            nullable=True,
        ),
        sa.Column(
            "last_login_at",
            sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"),
            nullable=True,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_iam_users")),
        sa.UniqueConstraint("email", name=op.f("uq_iam_users_email")),
    )
    op.create_table(
        "iam_one_time_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("purpose", sa.String(length=30), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "expires_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "used_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["iam_users.id"], name=op.f("fk_iam_one_time_tokens_user_id")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_iam_one_time_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_iam_one_time_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_iam_one_time_tokens_user_id"), "iam_one_time_tokens", ["user_id"], unique=False
    )
    op.create_table(
        "iam_refresh_token_families",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("current_token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "expires_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "rotated_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=True
        ),
        sa.Column(
            "revoked_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=True
        ),
        sa.Column("revocation_reason", sa.String(length=30), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["iam_users.id"],
            name=op.f("fk_iam_refresh_token_families_user_id"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_iam_refresh_token_families")),
        sa.UniqueConstraint(
            "current_token_hash", name=op.f("uq_iam_refresh_token_families_current_token_hash")
        ),
    )
    op.create_index(
        op.f("ix_iam_refresh_token_families_user_id"),
        "iam_refresh_token_families",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "iam_retired_refresh_tokens",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["family_id"],
            ["iam_refresh_token_families.id"],
            name=op.f("fk_iam_retired_refresh_tokens_family_id"),
        ),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_iam_retired_refresh_tokens")),
    )
    op.create_index(
        op.f("ix_iam_retired_refresh_tokens_family_id"),
        "iam_retired_refresh_tokens",
        ["family_id"],
        unique=False,
    )


def downgrade() -> None:
    # DROP TABLE elimina también sus índices; MySQL no permite borrar antes un índice que
    # respalda una clave foránea.
    op.drop_table("iam_retired_refresh_tokens")
    op.drop_table("iam_refresh_token_families")
    op.drop_table("iam_one_time_tokens")
    op.drop_table("iam_users")
    op.drop_table("iam_audit_log")
