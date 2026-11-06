"""LangGraph query path. Every final claim carries stored evidence."""
import logging
from typing import TypedDict

from langgraph.graph import END, StateGraph
from sqlalchemy import select

from finreg.impact import classify
from finreg.models import BusinessProfile, Document, Obligation, Passage
from finreg.retrieval import expand_by_article, query_terms, search

logger = logging.getLogger(__name__)

class QueryState(TypedDict, total=False):
    question: str
    profile_id: str | None
    session: object
    kind: str
    passage_ids: list[str]
    retrieval_mode: str
    graph: list[dict]
    items: list[dict]
    answer: str


def classify_query(state: QueryState) -> QueryState:
    return {"kind": "impact" if state.get("profile_id") else "question"}


def retrieve(state: QueryState) -> QueryState:
    passages, mode = search(state["session"], state["question"])
    expanded = expand_by_article(state["session"], passages)
    return {"passage_ids": [p.id for p in expanded], "retrieval_mode": f"{mode}+article"}


def explore(state: QueryState) -> QueryState:
    from finreg.graph import neighbors
    ids = [o.id for o in state["session"].scalars(select(Obligation).where(Obligation.passage_id.in_(state["passage_ids"]))).all()]
    try:
        graph = neighbors(ids)
    except Exception:
        logger.warning("Graph traversal unavailable", exc_info=True)
        graph = []
    return {"graph": graph}


def analyze(state: QueryState) -> QueryState:
    session = state["session"]
    profile = session.get(BusinessProfile, state["profile_id"]) if state.get("profile_id") else None
    terms = query_terms(state["question"])
    items = []
    for obligation in session.scalars(select(Obligation).where(Obligation.passage_id.in_(state["passage_ids"]))).all():
        if obligation.subject.casefold() in {"they", "it", "these", "those"}:
            continue
        passage = session.get(Passage, obligation.passage_id)
        document = session.get(Document, obligation.document_id)
        item = {"id": obligation.id, "subject": obligation.subject, "action": obligation.action,
            "confidence": obligation.confidence, "extracted_fact": True,
            "evidence": {"passage_id": passage.id, "document_id": document.id,
                "article": passage.article, "page": passage.page,
                "quote": obligation.evidence_quote or passage.text,
                "source_url": document.source_url}}
        if profile:
            item["impact"] = classify(profile, obligation)
        subject_terms = query_terms(obligation.subject)
        action_terms = query_terms(obligation.action)
        item["_rank"] = 3 * len(terms & subject_terms) + len(terms & action_terms)
        item["_ordinal"] = passage.ordinal
        items.append(item)
    items.sort(key=lambda item: (-item["_rank"], item["_ordinal"]))
    for item in items:
        del item["_rank"]
        del item["_ordinal"]
    return {"items": items[:12]}


def verify(state: QueryState) -> QueryState:
    session = state["session"]
    valid = []
    for item in state["items"]:
        passage = session.get(Passage, item["evidence"]["passage_id"])
        quote = item["evidence"]["quote"]
        if passage and quote in passage.text and item["action"] in quote:
            valid.append(item)
    return {"items": valid}


def respond(state: QueryState) -> QueryState:
    count = len(state["items"])
    if not count:
        answer = "No supported obligation was found in the indexed evidence for this query."
    else:
        answer = f"Found {count} evidence-linked obligation candidate{'s' if count != 1 else ''}. Review the cited passages and applicability before acting."
    return {"answer": answer}


builder = StateGraph(QueryState)
for name, fn in [("classify", classify_query), ("retrieve", retrieve), ("explore", explore),
                 ("analyze", analyze), ("verify", verify), ("respond", respond)]:
    builder.add_node(name, fn)
builder.set_entry_point("classify")
for first, second in [("classify", "retrieve"), ("retrieve", "explore"),
                      ("explore", "analyze"), ("analyze", "verify"), ("verify", "respond")]:
    builder.add_edge(first, second)
builder.add_edge("respond", END)
query_graph = builder.compile()
