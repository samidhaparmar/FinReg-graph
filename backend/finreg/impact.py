"""Heuristic candidate matching. Output is an interpretation, never legal scope."""
import re

from finreg.models import BusinessProfile, Obligation

STOP = {"shall", "must", "have", "with", "their", "from", "that", "this", "which", "such", "into", "they", "them", "financial", "entities"}
NON_BUSINESS_ACTORS = {"competent authorities", "auditors", "this regulation", "esma", "eba"}


def terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{4,}", text.casefold()) if w not in STOP}


def classify(profile: BusinessProfile, obligation: Obligation) -> dict:
    business = terms(" ".join([profile.entity_type, *profile.activities]))
    regulatory = terms(obligation.subject + " " + obligation.action)
    overlap = sorted(business & regulatory)
    entity_match = profile.entity_type.casefold() in obligation.subject.casefold()
    non_business_actor = any(actor in obligation.subject.casefold() for actor in NON_BUSINESS_ACTORS)
    if non_business_actor:
        level = "unclear"
        reason = f"The cited duty names {obligation.subject} as its subject; this profile is not that actor."
    elif entity_match and overlap:
        level = "potential"
        reason = f"Candidate match based on {', '.join(overlap)}"
    elif overlap:
        level = "review"
        reason = f"Candidate match based on {', '.join(overlap)}; verify whether this business falls within the cited subject."
    else:
        level = "unclear"
        reason = "No matching activity terms; scope needs human review"
    return {"classification": level, "matched_terms": overlap,
        "reason": reason,
        "interpretation": True}
