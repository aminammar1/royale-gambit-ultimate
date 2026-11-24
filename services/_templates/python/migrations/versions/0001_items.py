"""Create items.

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE items (
            id         uuid PRIMARY KEY,
            name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE items")
