"""Small reproducible extraction and retrieval baseline evaluation.

Run from backend: python -m evaluation.run
"""
import json
import re
from pathlib import Path

from finreg.nlp import extract_obligations, validate_evidence


def tokens(text):
    return set(re.findall(r"[a-z]{3,}", text.casefold()))


def metrics():
    rows = json.loads((Path(__file__).parent / "gold.json").read_text())
    tp = fp = fn = citations = claims = unsupported = retrieval_hits = graph_hits = retrieval_total = 0
    for row in rows:
        found = extract_obligations(row["text"])
        expected = {s.casefold() for s in row["gold_subjects"]}
        predicted = {o.subject.casefold() for o in found}
        tp += len(expected & predicted)
        fp += len(predicted - expected)
        fn += len(expected - predicted)
        for item in found:
            claims += 1
            citations += int(validate_evidence(item, row["text"]))
            unsupported += int(item.action not in row["text"])
        for query in row["queries"]:
            retrieval_total += 1
            ranked = sorted(rows, key=lambda x: len(tokens(query) & tokens(x["text"])), reverse=True)
            retrieval_hits += int(row["id"] in [x["id"] for x in ranked[:1]])
            expanded = ranked[:1] + [x for x in rows if x["article"] == ranked[0]["article"] and x["id"] != ranked[0]["id"]]
            graph_hits += int(row["id"] in [x["id"] for x in expanded[:2]])
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    return {"dataset_size": len(rows), "entity_precision": precision, "entity_recall": recall,
            "entity_f1": 2 * precision * recall / (precision + recall) if precision + recall else 0,
            "baseline_recall_at_1": retrieval_hits / retrieval_total if retrieval_total else 0,
            "graph_expansion_recall_at_2": graph_hits / retrieval_total if retrieval_total else 0,
            "citation_accuracy": citations / claims if claims else 0,
            "unsupported_claims": unsupported}


if __name__ == "__main__":
    print(json.dumps(metrics(), indent=2))
