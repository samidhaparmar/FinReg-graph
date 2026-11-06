from uuid import uuid4
from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from finreg.db import Base


def new_id() -> str:
    return str(uuid4())


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(255))
    regulation_id: Mapped[str] = mapped_column(String(80))
    version: Mapped[str] = mapped_column(String(80))
    source_url: Mapped[str | None] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    filename: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    passages: Mapped[list["Passage"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class Passage(Base):
    __tablename__ = "passages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    article: Mapped[str | None] = mapped_column(String(60))
    page: Mapped[int] = mapped_column(Integer)
    ordinal: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    entities: Mapped[list[dict]] = mapped_column(JSON, default=list)
    document: Mapped[Document] = relationship(back_populates="passages")


class Obligation(Base):
    __tablename__ = "obligations"
    __table_args__ = (UniqueConstraint("passage_id", "subject", "action", name="uq_obligation_evidence"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    passage_id: Mapped[str] = mapped_column(ForeignKey("passages.id", ondelete="CASCADE"))
    subject: Mapped[str] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(Text)
    deadline: Mapped[str | None] = mapped_column(String(100))
    confidence: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(30))
    passage: Mapped[Passage] = relationship()


class BusinessProfile(Base):
    __tablename__ = "business_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    entity_type: Mapped[str] = mapped_column(String(120))
    activities: Mapped[list[str]] = mapped_column(JSON)
