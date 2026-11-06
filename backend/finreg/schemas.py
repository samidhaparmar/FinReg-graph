
from pydantic import BaseModel, Field


class Evidence(BaseModel):
    passage_id: str
    document_id: str
    article: str | None
    page: int
    quote: str
    source_url: str | None = None


class ExtractedObligation(BaseModel):
    subject: str = Field(min_length=2)
    action: str = Field(min_length=5)
    evidence_quote: str = Field(min_length=5)
    deadline: str | None = None
    confidence: float = Field(ge=0, le=1)


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    entity_type: str = Field(min_length=2, max_length=120)
    activities: list[str] = Field(min_length=1)


class QueryIn(BaseModel):
    question: str = Field(min_length=3)
    profile_id: str | None = None
