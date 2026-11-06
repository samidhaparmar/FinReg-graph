"""Initial evidence store.

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("documents", sa.Column("id", sa.String(36), primary_key=True), sa.Column("title", sa.String(255), nullable=False), sa.Column("regulation_id", sa.String(80), nullable=False), sa.Column("version", sa.String(80), nullable=False), sa.Column("source_url", sa.Text()), sa.Column("sha256", sa.String(64), nullable=False, unique=True), sa.Column("filename", sa.String(255), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_table("passages", sa.Column("id", sa.String(36), primary_key=True), sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False), sa.Column("article", sa.String(60)), sa.Column("page", sa.Integer(), nullable=False), sa.Column("ordinal", sa.Integer(), nullable=False), sa.Column("text", sa.Text(), nullable=False), sa.Column("entities", sa.JSON(), nullable=False))
    op.create_index("ix_passages_document_id", "passages", ["document_id"])
    op.create_table("obligations", sa.Column("id", sa.String(36), primary_key=True), sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False), sa.Column("passage_id", sa.String(36), sa.ForeignKey("passages.id", ondelete="CASCADE"), nullable=False), sa.Column("subject", sa.String(200), nullable=False), sa.Column("action", sa.Text(), nullable=False), sa.Column("deadline", sa.String(100)), sa.Column("confidence", sa.Float(), nullable=False), sa.Column("method", sa.String(30), nullable=False), sa.UniqueConstraint("passage_id", "subject", "action", name="uq_obligation_evidence"))
    op.create_table("business_profiles", sa.Column("id", sa.String(36), primary_key=True), sa.Column("name", sa.String(200), nullable=False), sa.Column("entity_type", sa.String(120), nullable=False), sa.Column("activities", sa.JSON(), nullable=False))


def downgrade():
    op.drop_table("business_profiles")
    op.drop_table("obligations")
    op.drop_index("ix_passages_document_id", "passages")
    op.drop_table("passages")
    op.drop_table("documents")
