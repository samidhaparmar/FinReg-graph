"""Conservative extraction: store only claims grounded in a passage."""
import re
from finreg.schemas import ExtractedObligation

MODAL = re.compile(r"\b(shall|must)\b", re.IGNORECASE)
SENTENCE = re.compile(r"(?<=[.;])\s+(?=[A-Z(\d])")
DEADLINE = re.compile(r"\b(?:within\s+\d+\s+(?:days?|months?|years?)|by\s+\d{1,2}\s+\w+\s+\d{4})\b", re.IGNORECASE)


def extract_obligations(text: str) -> list[ExtractedObligation]:
    obligations: list[ExtractedObligation] = []
    for sentence in SENTENCE.split(text):
        sentence = sentence.strip()
        modal = MODAL.search(sentence)
        if not modal:
            continue
        subject = sentence[: modal.start()].strip(" 0123456789.();:")
        if not subject or len(subject) > 180:
            continue
        action = sentence[modal.start() :].strip()
        if len(action) < 8:
            continue
        deadline = DEADLINE.search(sentence)
        obligations.append(ExtractedObligation(subject=subject, action=action,
            evidence_quote=sentence, deadline=deadline.group(0) if deadline else None,
            confidence=0.65))
    return obligations


def validate_evidence(item: ExtractedObligation, passage: str) -> bool:
    clean = lambda s: re.sub(r"\s+", " ", s).strip()
    quote = clean(item.evidence_quote)
    return (quote in clean(passage) and clean(item.subject) in quote
            and clean(item.action) in quote and MODAL.search(quote) is not None)


def extract_with_llm(text: str, model: str, base_url: str) -> list[ExtractedObligation]:
    from langchain_ollama import ChatOllama
    from pydantic import BaseModel

    class Result(BaseModel):
        obligations: list[ExtractedObligation]

    llm = ChatOllama(model=model, base_url=base_url, temperature=0).with_structured_output(Result)
    result = llm.invoke("Extract only explicit shall/must obligations from this passage. "
        "Copy each evidence_quote exactly. Do not infer applicability or create obligations.\n\n" + text)
    return [item for item in result.obligations if validate_evidence(item, text)]
