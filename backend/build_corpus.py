"""Build demo-sized, provenance-safe retrieval documents.

The lecture corpus is rebuilt from raw YouTube caption cues so every segment
has a deterministic time range. The book corpus is rebuilt page-by-page so a
citation can never drift onto a neighbouring page.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
NON_VERBAL = re.compile(r"^\[[^\]]*\]$")

# Small, corpus-observed alias map. This is metadata enrichment for exact
# chemistry terms; semantic recall still comes from multilingual embeddings.
CONCEPT_ALIASES: list[tuple[str, tuple[str, ...]]] = [
    ("Iodoform Test", ("iodoform", "आयोडो फॉर्म", "आयोडोफॉर्म")),
    ("Lucas Test", ("lucas", "लुकास")),
    ("Victor Meyer Test", ("victor meyer", "विक्टर मेयर", "विक्टर मायर")),
    ("Williamson Ether Synthesis", ("williamson", "विलियमसन", "विलियम्सन")),
    ("Grignard Reagent", ("grignard", "रिगना", "ग्रिगनार्ड", "rignard")),
    ("Ester Reaction", (" ester", "एस्टर", "इस्टर")),
    ("Hydroboration-Oxidation", ("hydroboration", "हाइड्रोबोरेशन")),
    ("Dehydration of Alcohol", ("dehydration", "डिहाइड्रेशन")),
    ("Oxidation of Alcohol", ("oxidation", "ऑक्सीडेशन", "ऑक्सीकरण")),
    ("Pinacol-Pinacolone Rearrangement", ("pinacol", "पिनाकोल", "पिनाकॉल")),
    ("Phenol", ("phenol", "फिनॉल", "फेनॉल", "फिनोल")),
    ("Primary Alcohol", ("primary alcohol", "प्राइमरी अल्कोहल", "1 डिग्री अल्कोहल")),
    ("Secondary Alcohol", ("secondary alcohol", "सेकेंडरी अल्कोहल", "2 डिग्री अल्कोहल")),
    ("Tertiary Alcohol", ("tertiary alcohol", "टर्शरी अल्कोहल", "3 डिग्री अल्कोहल")),
    ("Carbocation Rearrangement", ("rearrangement", "रिएरेंजमेंट", "रिअरेंजमेंट")),
    ("SN1 Mechanism", ("sn1",)),
    ("SN2 Mechanism", ("sn2",)),
    ("Aldehyde", ("aldehyde", "एल्डिहाइड")),
    ("Ketone", ("ketone", "कीटोन")),
    ("Ether", ("ether", "ईथर")),
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def concept_labels(text: str) -> list[str]:
    lowered = text.lower()
    return [label for label, patterns in CONCEPT_ALIASES if any(pattern in lowered for pattern in patterns)]


def windows(cues: list[dict[str, Any]], target_seconds: int = 38, max_seconds: int = 55) -> Iterable[list[dict[str, Any]]]:
    """Create short evidence windows with about eight seconds of cue overlap."""
    start = 0
    while start < len(cues):
        group: list[dict[str, Any]] = []
        end_index = start
        for index in range(start, len(cues)):
            cue = cues[index]
            group.append(cue)
            end_index = index
            elapsed = (cue["offset"] + cue["duration"] - group[0]["offset"]) / 1000
            next_cue = cues[index + 1] if index + 1 < len(cues) else None
            gap = (
                (next_cue["offset"] - cue["offset"] - cue["duration"]) / 1000
                if next_cue
                else 99
            )
            if elapsed >= max_seconds or (elapsed >= target_seconds and gap >= 0.45):
                break

        yield group
        if end_index >= len(cues) - 1:
            return

        cutoff_ms = group[-1]["offset"] + group[-1]["duration"] - 8000
        next_start = end_index + 1
        for index in range(end_index, start, -1):
            if cues[index]["offset"] <= cutoff_ms:
                next_start = index
                break
        start = max(start + 1, next_start)


def overlapping_legacy_chunk(
    legacy: list[dict[str, Any]], start_seconds: int, end_seconds: int
) -> dict[str, Any] | None:
    candidates = [
        chunk
        for chunk in legacy
        if chunk["startSeconds"] < end_seconds and chunk["endSeconds"] > start_seconds
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda chunk: min(end_seconds, chunk["endSeconds"])
        - max(start_seconds, chunk["startSeconds"]),
    )


def build_video_documents() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    videos = read_json(DATA / "videos.json")
    legacy_chunks = read_json(DATA / "video-chunks.json")
    legacy_by_video: dict[str, list[dict[str, Any]]] = {}
    for chunk in legacy_chunks:
        legacy_by_video.setdefault(chunk["videoId"], []).append(chunk)

    documents: list[dict[str, Any]] = []
    ui_chunks: list[dict[str, Any]] = []
    for video in videos:
        raw = read_json(DATA / "raw" / f"{video['videoId']}.json")
        cues = [
            cue
            for cue in raw.get("cues", [])
            if clean_text(cue.get("text", ""))
            and not NON_VERBAL.match(clean_text(cue["text"]))
        ]
        groups = list(windows(cues))
        for index, group in enumerate(groups):
            start_seconds = round(group[0]["offset"] / 1000)
            final = group[-1]
            end_seconds = round((final["offset"] + final["duration"]) / 1000)
            text = clean_text(" ".join(cue["text"] for cue in group))
            legacy = overlapping_legacy_chunk(
                legacy_by_video.get(video["videoId"], []), start_seconds, end_seconds
            )
            direct_labels = concept_labels(text)
            topic = " — ".join(direct_labels[:3]) or (
                legacy["topic"]
                if legacy
                else f"{video['lecture']} at {start_seconds // 60}:{start_seconds % 60:02d}"
            )
            keywords = list(dict.fromkeys([*direct_labels, *(legacy.get("keywords", []) if legacy else [])]))
            chunk_id = f"video:{video['videoId']}:{index:04d}"
            context_groups = groups[max(0, index - 1) : min(len(groups), index + 2)]
            context = clean_text(
                " ".join(cue["text"] for nearby in context_groups for cue in nearby)
            )
            search_text = clean_text(
                f"{video['lecture']} {video['title']} {topic} {' '.join(keywords)} {text}"
            )
            metadata = {
                "videoId": video["videoId"],
                "videoTitle": video["title"],
                "lecture": video["lecture"],
                "startSeconds": start_seconds,
                "endSeconds": end_seconds,
                "topic": topic,
                "keywords": keywords,
                "transcriptOrigin": raw.get("method", "youtube-caption"),
                "transcriptLanguage": raw.get("lang", "unknown"),
                "timestampMethod": "youtube-caption-cue",
            }
            documents.append(
                {
                    "id": chunk_id,
                    "sourceType": "video",
                    "text": text,
                    "context": context,
                    "searchText": search_text,
                    "metadata": metadata,
                }
            )
            ui_chunks.append({"id": chunk_id, "text": text, **metadata})
    return documents, ui_chunks


def split_page(text: str, target: int = 1100, overlap: int = 140) -> list[str]:
    text = text.strip()
    if len(text) <= target:
        return [text] if text else []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + target)
        if end < len(text):
            natural = max(text.rfind("\n", start + target // 2, end), text.rfind(". ", start + target // 2, end))
            if natural > start:
                end = natural + 1
        chunk = clean_text(text[start:end])
        if len(chunk) >= 120:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(start + 1, end - overlap)
    return chunks


def build_book_documents() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    pages = read_json(DATA / "book-pages.json")
    documents: list[dict[str, Any]] = []
    ui_chunks: list[dict[str, Any]] = []
    for page in pages:
        for index, text in enumerate(split_page(page["text"])):
            # Printed page labels can repeat in front matter or when a footer is
            # unreadable. The physical PDF page makes provenance IDs stable and
            # globally unique while retaining the student-facing printed page.
            chunk_id = (
                f"book:pdf{page['pdfPage']:04d}:p{page['page']:04d}:{index:02d}"
            )
            section = f"Ch. {page['chapterNumber']} {page['chapterTitle']}"
            metadata = {
                "page": page["page"],
                "pageEnd": page["page"],
                "pdfPage": page["pdfPage"],
                "chapterNumber": page["chapterNumber"],
                "chapterTitle": page["chapterTitle"],
                "section": section,
                "keywords": [],
                "parser": "pypdf-page-bounded",
            }
            documents.append(
                {
                    "id": chunk_id,
                    "sourceType": "book",
                    "text": text,
                    "context": text,
                    "searchText": clean_text(f"{section} page {page['page']} {text}"),
                    "metadata": metadata,
                }
            )
            ui_chunks.append({"id": chunk_id, "text": text, **metadata})
    return documents, ui_chunks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--book",
        help="Original PDF. When supplied, refresh book-pages.json before building the corpus.",
    )
    args = parser.parse_args()

    if args.book:
        import subprocess
        import sys

        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "extract-book.py"), args.book],
            check=True,
        )

    video_documents, video_ui = build_video_documents()
    book_documents, book_ui = build_book_documents()
    documents = [*video_documents, *book_documents]
    backend_data = ROOT / "backend" / "data"
    backend_data.mkdir(parents=True, exist_ok=True)
    with (backend_data / "documents.jsonl").open("w", encoding="utf-8") as handle:
        for document in documents:
            handle.write(json.dumps(document, ensure_ascii=False) + "\n")
    write_json(DATA / "video-chunks-v2.json", video_ui)
    write_json(DATA / "book-chunks-v2.json", book_ui)
    print(
        f"Built {len(video_documents)} lecture segments and {len(book_documents)} page-safe book chunks."
    )


if __name__ == "__main__":
    main()
