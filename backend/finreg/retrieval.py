"""Semantic search with a lexical baseline when the vector service is unavailable."""
import re
from functools import lru_cache
from sqlalchemy import select
from finreg.config import settings
from finreg.models import Passage


@lru_cache(maxsize=1)
def encoder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(settings.embedding_model)


def index_passages(passages: list[Passage]) -> None:
    from qdrant_client import QdrantClient, models
    client = QdrantClient(url=settings.qdrant_url)
    vectors = encoder().encode([p.text for p in passages]).tolist()
    size = len(vectors[0])
    if not client.collection_exists("passages"):
        client.create_collection("passages", vectors_config=models.VectorParams(size=size, distance=models.Distance.COSINE))
    client.upsert("passages", points=[models.PointStruct(id=p.id, vector=v, payload={"document_id": p.document_id}) for p, v in zip(passages, vectors)])


def search(session, query: str, limit: int = 8, semantic: bool = True) -> tuple[list[Passage], str]:
    if semantic:
        try:
            from qdrant_client import QdrantClient
            client = QdrantClient(url=settings.qdrant_url)
            hits = client.query_points("passages", query=encoder().encode(query).tolist(), limit=limit).points
            passages = [session.get(Passage, str(hit.id)) for hit in hits]
            return [p for p in passages if p], "semantic"
        except Exception:
            pass
    tokens = set(re.findall(r"[a-z]{3,}", query.lower()))
    passages = session.scalars(select(Passage)).all()
    ranked = sorted(passages, key=lambda p: len(tokens & set(re.findall(r"[a-z]{3,}", p.text.lower()))), reverse=True)
    return [p for p in ranked[:limit] if tokens & set(re.findall(r"[a-z]{3,}", p.text.lower()))], "lexical"


def expand_by_article(session, passages: list[Passage], limit: int = 12) -> list[Passage]:
    """Follow the Regulation→Article→Passage relationship from retrieved evidence."""
    seen = {p.id for p in passages}
    expanded = list(passages)
    for passage in passages:
        related = session.scalars(select(Passage).where(
            Passage.document_id == passage.document_id, Passage.article == passage.article)).all()
        for candidate in related:
            if candidate.id not in seen:
                expanded.append(candidate)
                seen.add(candidate.id)
            if len(expanded) >= limit:
                return expanded
    return expanded
