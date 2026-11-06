"""Store the exact obligation sentence used as evidence.

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("obligations", sa.Column("evidence_quote", sa.Text(), nullable=True))
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT o.id, o.subject, o.action, p.text AS passage FROM obligations o JOIN passages p ON p.id = o.passage_id"))
    for row in rows:
        candidate = f"{row.subject} {row.action}"
        quote = candidate if candidate in row.passage else row.passage
        bind.execute(sa.text("UPDATE obligations SET evidence_quote = :quote WHERE id = :id"),
                     {"quote": quote, "id": row.id})


def downgrade():
    op.drop_column("obligations", "evidence_quote")
