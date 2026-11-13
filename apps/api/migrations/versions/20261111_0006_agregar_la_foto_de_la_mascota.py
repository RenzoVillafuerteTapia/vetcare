"""agregar la foto de la mascota

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Clave del archivo en el almacén privado (sin datos personales), no una URL.
    op.add_column("cust_pets", sa.Column("photo_key", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("cust_pets", "photo_key")
