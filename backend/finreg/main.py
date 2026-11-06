import hashlib
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session
from finreg.config import settings
from finreg.db import get_session
from finreg.ingestion import extract_passages
from finreg.models import BusinessProfile, Document, Obligation, Passage
from finreg.nlp import extract_obligations, extract_with_llm, validate_evidence
from finreg.schemas import ProfileIn, QueryIn
from finreg.workflow import query_graph
from finreg.compare import compare_documents
from finreg.entities import detect_entities

app = FastAPI(title="FinReg Graph", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","),
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/documents")
def documents(session: Session = Depends(get_session)):
    return [{"id": d.id, "title": d.title, "regulation_id": d.regulation_id,
             "version": d.version, "source_url": d.source_url, "created_at": d.created_at}
            for d in session.scalars(select(Document).order_by(Document.created_at.desc())).all()]


@app.post("/documents", status_code=201)
async def upload_document(file: UploadFile = File(...), title: str = Form(...),
                          regulation_id: str = Form(...), version: str = Form(...),
                          source_url: str | None = Form(None), session: Session = Depends(get_session)):
    raw = await file.read(25_000_001)
    if len(raw) > 25_000_000:
        raise HTTPException(413, "PDF exceeds the 25 MB limit")
    digest = hashlib.sha256(raw).hexdigest()
    existing = session.scalar(select(Document).where(Document.sha256 == digest))
    if existing:
        raise HTTPException(409, f"Document already uploaded: {existing.id}")
    try:
        chunks = extract_passages(raw)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not chunks:
        raise HTTPException(422, "No article passages were found; scanned PDFs need OCR")
    document = Document(title=title.strip(), regulation_id=regulation_id.strip(), version=version.strip(),
                        source_url=source_url, sha256=digest, filename=file.filename or "upload.pdf")
    session.add(document)
    session.flush()
    passages = []
    obligations = []
    for ordinal, chunk in enumerate(chunks):
        passage = Passage(document_id=document.id, ordinal=ordinal,
                          entities=detect_entities(chunk["text"]), **chunk)
        session.add(passage)
        session.flush()
        passages.append(passage)
        candidates = extract_obligations(passage.text)
        if settings.enable_llm:
            try:
                candidates.extend(extract_with_llm(passage.text, settings.ollama_model, settings.ollama_url))
            except Exception:
                pass
        seen = set()
        for candidate in candidates:
            if not validate_evidence(candidate, passage.text):
                continue
            key = (candidate.subject.casefold(), candidate.action.casefold())
            if key in seen:
                continue
            seen.add(key)
            item = Obligation(document_id=document.id, passage_id=passage.id,
                              subject=candidate.subject, action=candidate.action,
                              deadline=candidate.deadline, confidence=candidate.confidence,
                              method="explicit_modal")
            session.add(item)
            obligations.append(item)
    session.commit()
    warnings = []
    try:
        from finreg.retrieval import index_passages
        index_passages(passages)
    except Exception as exc:
        warnings.append(f"Vector indexing unavailable: {type(exc).__name__}")
    try:
        from finreg.graph import project_document
        project_document(document, passages, obligations)
    except Exception as exc:
        warnings.append(f"Graph projection unavailable: {type(exc).__name__}")
    return {"id": document.id, "passages": len(passages), "obligations": len(obligations), "warnings": warnings}


@app.get("/documents/{document_id}/passages")
def document_passages(document_id: str, session: Session = Depends(get_session)):
    if not session.get(Document, document_id):
        raise HTTPException(404, "Document not found")
    return [{"id": p.id, "article": p.article, "page": p.page, "ordinal": p.ordinal,
             "text": p.text,
             "entities": p.entities}
            for p in session.scalars(select(Passage).where(Passage.document_id == document_id).order_by(Passage.ordinal)).all()]


@app.get("/compare")
def compare(first_id: str, second_id: str, session: Session = Depends(get_session)):
    first, second = session.get(Document, first_id), session.get(Document, second_id)
    if not first or not second:
        raise HTTPException(404, "Document not found")
    if first.regulation_id != second.regulation_id:
        raise HTTPException(422, "Documents must have the same regulation ID")
    return {"first_id": first_id, "second_id": second_id,
            "changes": compare_documents(session, first_id, second_id)}


@app.get("/graph")
def graph_data(session: Session = Depends(get_session)):
    nodes, edges = [], []
    for doc in session.scalars(select(Document)).all():
        nodes.append({"id": doc.id, "label": doc.regulation_id, "type": "regulation"})
    articles = set()
    for passage in session.scalars(select(Passage)).all():
        article_id = f"{passage.document_id}:{passage.article}"
        if article_id not in articles:
            articles.add(article_id)
            nodes.append({"id": article_id, "label": passage.article, "type": "article"})
            edges.append({"source": passage.document_id, "target": article_id, "label": "HAS_ARTICLE"})
        for entity in passage.entities:
            entity_id = f"entity:{entity['type']}:{entity['text'].casefold()}"
            if not any(node["id"] == entity_id for node in nodes):
                nodes.append({"id": entity_id, "label": entity["text"], "type": "entity"})
            edges.append({"source": article_id, "target": entity_id, "label": "MENTIONS"})
    for obligation in session.scalars(select(Obligation)).all():
        passage = session.get(Passage, obligation.passage_id)
        nodes.append({"id": obligation.id, "label": obligation.action[:65], "type": "obligation"})
        edges.append({"source": f"{obligation.document_id}:{passage.article}", "target": obligation.id, "label": "STATES"})
    for profile in session.scalars(select(BusinessProfile)).all():
        nodes.append({"id": profile.id, "label": profile.name, "type": "profile"})
        for activity in profile.activities:
            process_id = f"process:{activity.casefold()}"
            if not any(node["id"] == process_id for node in nodes):
                nodes.append({"id": process_id, "label": activity, "type": "process"})
            edges.append({"source": profile.id, "target": process_id, "label": "PERFORMS"})
    return {"nodes": nodes, "edges": edges}


@app.get("/profiles")
def profiles(session: Session = Depends(get_session)):
    return [{"id": p.id, "name": p.name, "entity_type": p.entity_type, "activities": p.activities}
            for p in session.scalars(select(BusinessProfile)).all()]


@app.post("/profiles", status_code=201)
def create_profile(data: ProfileIn, session: Session = Depends(get_session)):
    profile = BusinessProfile(**data.model_dump())
    session.add(profile)
    session.commit()
    try:
        from finreg.graph import project_profile
        project_profile(profile)
    except Exception:
        pass
    return {"id": profile.id, **data.model_dump()}


@app.post("/query")
def query(data: QueryIn, session: Session = Depends(get_session)):
    if data.profile_id and not session.get(BusinessProfile, data.profile_id):
        raise HTTPException(404, "Profile not found")
    result = query_graph.invoke({"question": data.question, "profile_id": data.profile_id,
                                 "session": session})
    return {key: result[key] for key in ("answer", "items", "graph", "retrieval_mode", "kind")}
