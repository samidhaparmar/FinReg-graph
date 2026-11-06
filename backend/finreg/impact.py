"""Heuristic candidate matching. Output is an interpretation, never legal scope."""
import re

from finreg.models import BusinessProfile, Obligation

STOP = {"shall", "must", "have", "with", "their", "from", "that", "this", "which", "such", "into", "they", "them", "financial", "entities"}


def terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{4,}", text.casefold()) if w not in STOP}


def classify(profile: BusinessProfile, obligation: Obligation) -> dict:
    business = terms(" ".join([profile.entity_type, *profile.activities]))
    regulatory = terms(obligation.subject + " " + obligation.action)
    overlap = sorted(business & regulatory)
    entity_match = profile.entity_type.casefold() in obligation.subject.casefold()
    if entity_match and overlap:
        level = "potential"
    elif overlap:
        level = "review"
    else:
        level = "unclear"
    return {"classification": level, "matched_terms": overlap,
        "reason": f"Candidate match based on {', '.join(overlap)}" if overlap else "No matching activity terms; scope needs human review",
        "interpretation": True}
