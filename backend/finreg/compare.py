"""Version comparison based on article text, without interpreting legal changes."""
from difflib import unified_diff
from sqlalchemy import select
from finreg.models import Passage


def compare_documents(session, first_id: str, second_id: str) -> list[dict]:
    def articles(document_id: str) -> dict[str, str]:
        grouped: dict[str, list[str]] = {}
        for p in session.scalars(select(Passage).where(Passage.document_id == document_id).order_by(Passage.ordinal)).all():
            grouped.setdefault(p.article or "Unnumbered", []).append(p.text)
        return {key: "\n".join(value) for key, value in grouped.items()}
    before, after = articles(first_id), articles(second_id)
    result = []
    for article in sorted(before.keys() | after.keys()):
        left, right = before.get(article, ""), after.get(article, "")
        if left == right:
            continue
        change = "added" if not left else "removed" if not right else "changed"
        diff = "\n".join(unified_diff(left.splitlines(), right.splitlines(), fromfile="before", tofile="after", lineterm=""))
        result.append({"article": article, "change": change, "diff": diff})
    return result
