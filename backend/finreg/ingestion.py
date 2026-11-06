"""Page-aware PDF parsing. Article headings are carried across page breaks."""
import re

import fitz

ARTICLE = re.compile(r"^Article\s+(\d+[A-Za-z]?)\s*$", re.IGNORECASE)


def extract_passages(pdf_bytes: bytes) -> list[dict]:
    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("Upload a PDF document")
    try:
        pdf = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError("The PDF could not be opened") from exc
    if pdf.page_count > 300:
        raise ValueError("PDF exceeds the 300-page limit")
    result: list[dict] = []
    article: str | None = None
    for page_no, page in enumerate(pdf, start=1):
        lines = [re.sub(r"\s+", " ", line).strip() for line in page.get_text(sort=True).splitlines()]
        buffer: list[str] = []
        for line in lines:
            match = ARTICLE.match(line)
            if match:
                if article and buffer:
                    result.extend(_paragraphs(buffer, article, page_no))
                article = f"Article {match.group(1)}"
                buffer = []
            elif article and line:
                buffer.append(line)
        if article and buffer:
            result.extend(_paragraphs(buffer, article, page_no))
    pdf.close()
    return result


def _paragraphs(lines: list[str], article: str, page: int) -> list[dict]:
    # Numbered paragraphs provide stable evidence boundaries where available.
    chunks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if re.match(r"^\d{1,2}\.\s", line) and current:
            chunks.append(current)
            current = []
        current.append(line)
    if current:
        chunks.append(current)
    return [{"article": article, "page": page, "text": " ".join(chunk)} for chunk in chunks if len(" ".join(chunk)) >= 25]
