"""
Stage 1 of the book pipeline: extract the FULL text of every page of
M.S. Chouhan's "Advanced Theory in Organic Chemistry for JEE" and write it,
page by page, to data/book-pages.json.

Design follows open-notebook's ingestion model (lfnovo/open-notebook): a source
document is stored as its complete extracted text and only *then* chunked
programmatically. The previous implementation here hand-wrote ~27 summary
"chunks" covering 18 of 602 pages (~1% of the book), which is why every student
question retrieved the same handful of pages — there was almost nothing else in
the index to match against.

Two things matter for citation quality and are handled explicitly:

1. PRINTED page number != PDF page index. The PDF has ~8 pages of front matter,
   so PDF page 505 carries the printed footer "Alkane 497". Students look up the
   printed number, so we detect it from the running footer and store both.

2. Chapter provenance. This PDF has no usable embedded outline (only 12 stray
   bookmarks for 31 chapters), so the chapter map below was reconstructed by
   scanning every page for chapter-start markers. Each page inherits its chapter
   so chunks can be cited as "Ch. 29 Alkene, p. 509".

Usage:  python scripts/extract-book.py [path-to-pdf]
"""

import json
import os
import re
import sys
from pathlib import Path

from pypdf import PdfReader

DEFAULT_PDF = (
    r"C:\Users\shish\Downloads\38833FF26BA1D.UnigramPreview_g9c9v27vpyspw!App"
    r"\Advanced_Theory_in_Organic_Chemistry_for_JEE_2edition,_2021_by_M.pdf"
)

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "data" / "book-pages.json"

# (pdf_page_where_chapter_starts, chapter_number, chapter_title)
# Reconstructed by scanning all 602 pages for "CHAPTER" markers, since the
# PDF's own outline is incomplete.
CHAPTERS = [
    (4, 1, "Introduction"),
    (9, 2, "Representation of Organic Compounds"),
    (18, 3, "Degree of Carbon & Hydrogen, Alcohol & Amine"),
    (26, 4, "Functional Groups"),
    (42, 5, "Double Bond Equivalent"),
    (48, 6, "Classification of Organic Compounds"),
    (50, 7, "Nomenclature of Alkanes"),
    (69, 8, "Nomenclature of Alkenes & Alkynes"),
    (78, 9, "Nomenclature of Alcohol, Ether, Aldehyde and Ketone"),
    (90, 10, "Nomenclature of Carboxylic Acid, Ester, Cyanide, Amide, Amine and Anhydride"),
    (110, 11, "Nomenclature of Polyfunctional Groups"),
    (131, 12, "Nomenclature of Aromatic Compounds"),
    (145, 13, "Inductive Effect"),
    (150, 14, "Resonance"),
    (194, 15, "Mesomeric Effect"),
    (197, 16, "Hyperconjugation"),
    (209, 17, "Application of Resonance, Hyperconjugation & Inductive Effect"),
    (217, 18, "Bond Energy and Bond Length"),
    (222, 19, "Heat of Hydrogenation and Heat of Combustion"),
    (228, 20, "Aromaticity"),
    (269, 21, "Acidic and Basic Strength"),
    (316, 22, "Isomerism"),
    (326, 23, "Tautomerism"),
    (345, 24, "Conformers"),
    (368, 25, "Geometrical Isomerism"),
    (386, 26, "Optical Isomerism"),
    (478, 27, "Basic Organic Chemistry"),
    (504, 28, "Alkane"),
    (516, 29, "Alkene"),
    (540, 30, "Alkyne"),
    (548, 31, "Benzene"),
    (587, 32, "Glossary"),
]

# The book's running footer, which appears on most pages and is pure noise.
RUNNING_FOOTER = re.compile(r"Ad\s*vance\s+The\s*ory\s+in\s+ORGANIC\s+CHEMISTRY", re.I)
# A piracy/Telegram watermark spliced into some pages by whoever made this scan.
WATERMARK = re.compile(r"(Join Us Now For all study Materials|unacademyplusdiscounts|t\.me/|@\w+_link)", re.I)


def chapter_for(pdf_page: int):
    """Return (number, title) of the chapter containing this PDF page."""
    current = (0, "Front Matter")
    for start, num, title in CHAPTERS:
        if pdf_page >= start:
            current = (num, title)
        else:
            break
    return current


def detect_printed_page(text: str, pdf_page: int):
    """
    Find the printed page number from the running header/footer.

    The book prints it two ways depending on odd/even page:
      "Alkane 497"                              -> trailing number
      "496 Ad vance The ory in ORGANIC CHEMISTRY" -> leading number
    Falls back to a fixed offset when the footer is unreadable (diagram-heavy
    pages sometimes lose it entirely).
    """
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for line in reversed(lines[-6:]):
        m = re.match(r"^(\d{1,3})\s+Ad\s*vance", line, re.I)
        if m:
            return int(m.group(1))
        m = re.match(r"^(.{2,60}?)\s+(\d{1,3})$", line)
        if m and not m.group(1).isdigit():
            candidate = int(m.group(2))
            # Sanity-check against the expected offset so a stray figure number
            # ("Table - 1 : Some LD 50") can't be mistaken for a page number.
            if abs(candidate - (pdf_page - 8)) <= 3:
                return candidate
    return max(pdf_page - 8, 1)


def clean_page_text(text: str) -> str:
    """
    Strip footers/watermarks and normalize whitespace, while deliberately
    keeping chemistry notation intact.

    We do NOT try to remove the fragmented leftovers of bond-line diagrams
    (e.g. "CH3 CH3 O"). They are noisy, but they also carry real reagent and
    formula tokens that students search for, and aggressive filtering was
    losing genuine content. Retrieval scoring tolerates the noise better than
    the index tolerates missing text.
    """
    lines = []
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if RUNNING_FOOTER.search(line):
            # Footer may be glued to real content; keep whatever precedes it.
            line = RUNNING_FOOTER.sub(" ", line).strip()
            line = re.sub(r"^\d{1,3}\s*", "", line).strip()
            if not line:
                continue
        if WATERMARK.search(line):
            continue
        lines.append(line)

    out = "\n".join(lines)
    # Collapse the run-together spacing pypdf produces inside words
    # ("sub sti tuted" -> left alone; "  " -> " ").
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    if not os.path.exists(pdf_path):
        raise SystemExit(f"PDF not found: {pdf_path}")

    reader = PdfReader(pdf_path)
    total = len(reader.pages)
    print(f"Reading {total} pages from {os.path.basename(pdf_path)}")

    pages = []
    empty = 0
    for i, page in enumerate(reader.pages):
        pdf_page = i + 1
        raw = page.extract_text() or ""
        text = clean_page_text(raw)
        if not text:
            empty += 1
            continue
        ch_num, ch_title = chapter_for(pdf_page)
        pages.append(
            {
                "pdfPage": pdf_page,
                "page": detect_printed_page(raw, pdf_page),
                "chapterNumber": ch_num,
                "chapterTitle": ch_title,
                "text": text,
            }
        )
        if pdf_page % 100 == 0:
            print(f"  ...{pdf_page}/{total}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8")

    chars = sum(len(p["text"]) for p in pages)
    print(f"\nWrote {len(pages)} pages ({empty} empty/skipped) to {OUT_PATH.relative_to(REPO_ROOT)}")
    print(f"Total extracted characters: {chars:,}")
    by_ch = {}
    for p in pages:
        key = f"Ch{p['chapterNumber']:02d} {p['chapterTitle']}"
        by_ch[key] = by_ch.get(key, 0) + len(p["text"])
    print("\nCharacters per chapter:")
    for key in sorted(by_ch):
        print(f"  {key}: {by_ch[key]:,}")


if __name__ == "__main__":
    main()
