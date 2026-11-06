"""Exact-span entity hints. These are mentions, not legal classifications."""
import re
from functools import lru_cache

TERMS = {
    "organization": ["European Supervisory Authorities", "European Banking Authority", "European Securities and Markets Authority"],
    "regulated_entity": ["financial entities", "payment institutions", "credit institutions", "ICT third-party service providers"],
    "financial_product": ["crypto-assets", "payment services", "electronic money"],
    "regulatory_concept": ["ICT risk management", "digital operational resilience", "ICT-related incident", "register of information"],
}
DEADLINE = re.compile(r"\b(?:within\s+\d+\s+(?:days?|months?|years?)|by\s+\d{1,2}\s+\w+\s+\d{4})\b", re.IGNORECASE)


@lru_cache(maxsize=1)
def _nlp():
    try:
        import spacy
        return spacy.load("en_core_web_sm")
    except (ImportError, OSError):
        return None


def detect_entities(text: str) -> list[dict]:
    found: dict[tuple[str, str], dict] = {}
    for kind, terms in TERMS.items():
        for term in terms:
            for match in re.finditer(r"\b" + re.escape(term) + r"\b", text, re.IGNORECASE):
                value = match.group(0)
                found[(kind, value.casefold())] = {"type": kind, "text": value, "start": match.start(), "end": match.end()}
    for match in DEADLINE.finditer(text):
        value = match.group(0)
        found[("deadline", value.casefold())] = {"type": "deadline", "text": value, "start": match.start(), "end": match.end()}
    nlp = _nlp()
    if nlp:
        for ent in nlp(text).ents:
            kind = {"ORG": "organization", "DATE": "deadline", "PRODUCT": "financial_product"}.get(ent.label_)
            if kind:
                found[(kind, ent.text.casefold())] = {"type": kind, "text": ent.text, "start": ent.start_char, "end": ent.end_char}
    return list(found.values())
