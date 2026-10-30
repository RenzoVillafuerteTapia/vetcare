from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Uuid,
)
from sqlalchemy.dialects import mysql

from vetcare.platform.db import metadata

_TS = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")

users = Table(
    "iam_users",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("email", String(254), nullable=False, unique=True),
    Column("full_name", String(150), nullable=False),
    Column("roles", JSON, nullable=False),
    Column("status", String(20), nullable=False),
    Column("password_hash", String(255), nullable=True),
    Column("failed_login_attempts", Integer, nullable=False),
    Column("locked_until", _TS, nullable=True),
    Column("created_at", _TS, nullable=False),
    Column("activated_at", _TS, nullable=True),
    Column("last_login_at", _TS, nullable=True),
    Column("version", Integer, nullable=False),
)

one_time_tokens = Table(
    "iam_one_time_tokens",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("user_id", Uuid, ForeignKey("iam_users.id"), nullable=False, index=True),
    Column("purpose", String(30), nullable=False),
    Column("token_hash", String(64), nullable=False, unique=True),
    Column("created_at", _TS, nullable=False),
    Column("expires_at", _TS, nullable=False),
    Column("used_at", _TS, nullable=True),
)

refresh_token_families = Table(
    "iam_refresh_token_families",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("user_id", Uuid, ForeignKey("iam_users.id"), nullable=False, index=True),
    Column("current_token_hash", String(64), nullable=False, unique=True),
    Column("created_at", _TS, nullable=False),
    Column("expires_at", _TS, nullable=False),
    Column("rotated_at", _TS, nullable=True),
    Column("revoked_at", _TS, nullable=True),
    Column("revocation_reason", String(30), nullable=True),
)

retired_refresh_tokens = Table(
    "iam_retired_refresh_tokens",
    metadata,
    Column("token_hash", String(64), primary_key=True),
    Column(
        "family_id", Uuid, ForeignKey("iam_refresh_token_families.id"), nullable=False, index=True
    ),
)

audit_log = Table(
    "iam_audit_log",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("occurred_at", _TS, nullable=False, index=True),
    Column("action", String(60), nullable=False),
    Column("actor_id", Uuid, nullable=True, index=True),
    Column("target_type", String(60), nullable=True),
    Column("target_id", Uuid, nullable=True),
    Column("ip_address", String(45), nullable=True),
    Column("details", JSON, nullable=False),
)
