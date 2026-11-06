import fitz
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from finreg.db import Base, get_session
from finreg.ingestion import extract_passages
from finreg.main import app
from finreg.nlp import extract_obligations, validate_evidence
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def sample_pdf():
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((72, 72), "Article 6\nICT risk management framework\n1. Financial entities shall maintain an ICT risk management framework.\n2. Providers may offer support.")
    data = pdf.tobytes()
    pdf.close()
    return data


def test_article_page_and_extraction():
    chunks = extract_passages(sample_pdf())
    assert all(chunk["article"] == "Article 6" and chunk["page"] == 1 for chunk in chunks)
    passage = next(chunk for chunk in chunks if "shall" in chunk["text"])
    claims = extract_obligations(passage["text"])
    assert len(claims) == 1
    assert claims[0].subject == "Financial entities"
    assert validate_evidence(claims[0], passage["text"])
    assert not validate_evidence(claims[0], "Different text")


def test_upload_query_returns_verifiable_evidence(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(engine)
    def override():
        with Session() as session:
            yield session
    app.dependency_overrides[get_session] = override
    monkeypatch.setattr("finreg.retrieval.index_passages", lambda passages: None)
    monkeypatch.setattr("finreg.graph.project_document", lambda *args: None)
    monkeypatch.setattr("finreg.graph.neighbors", lambda ids: [])
    from finreg import workflow
    original_search = workflow.search
    monkeypatch.setattr(workflow, "search", lambda session, query: original_search(session, query, semantic=False))
    try:
        client = TestClient(app)
        response = client.post("/documents", data={"title": "Test regulation", "regulation_id": "TEST", "version": "v1"}, files={"file": ("test.pdf", sample_pdf(), "application/pdf")})
        assert response.status_code == 201, response.text
        result = client.post("/query", json={"question": "ICT risk management framework"}).json()
        assert result["items"]
        item = result["items"][0]
        assert item["action"] in item["evidence"]["quote"]
        assert item["evidence"]["page"] == 1
        assert result["retrieval_mode"] == "lexical+article"
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
