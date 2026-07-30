# Plan.md - Vibrant Academy Kota AI Doubt Assistant

Context document for multi-threaded work. Updated after each session.

## What this is

Sales demo of a JEE/NEET Chemistry doubt-solving chatbot for Vibrant Academy
Kota. A student asks a doubt; the app answers and cites its sources:

- the exact **minute** of a real MS Chouhan YouTube lecture (deep-linked, not
  "go watch this 90-minute video")
- the exact **page** of MS Chouhan's textbook

Live: https://vibrant-academy-demo.vercel.app
Repo: https://github.com/dev-sanidhya/MSC-Demo

## Architecture

`backend/build_corpus.py` creates page-bounded book chunks and caption-cue
lecture segments. `backend/build_index.py` stores them in local Qdrant with
multilingual dense and BM25 sparse vectors. `backend/app.py` performs reciprocal
rank fusion, multilingual reranking, exact-label boosts, and adjacent-result
deduplication. The Next.js chat route rewrites ambiguous follow-ups, requests
retrieval, sends compact source blocks to Groq, and exposes only the source IDs
the generated answer actually cited.

This remains a local demo harness: no hosted vector database, ingestion queue,
tenant model, or production observability layer.

## Key decisions and why

- **Full-text extraction, not hand-written summaries.** The supplied 602-page
  PDF produced 592 text-bearing pages and 993 searchable page-safe chunks.
- **Transcript-derived timestamps.** The 1,244 lecture segments originate from
  raw YouTube caption cues. Segment boundaries keep their exact cue times.
- **Hybrid retrieval.** Multilingual semantic search covers paraphrases and
  Hindi/English code-switching; sparse BM25 preserves reagent and named-reaction
  precision. A reranker makes the final selection.
- **Grounded citations.** Search rank alone never creates a visible citation.
  The answer must reference a supplied source marker before the corresponding
  video or book panel is attached.
- **Model**: `llama-3.1-8b-instant`. The 70b model answers better but its
  free-tier cap is 100k tokens/**day**, which testing exhausted in one session.

## Known limitations (do not overclaim these)

- **The book is a concepts/theory text, not a qualitative-analysis one.**
  Verified zero occurrences across all 592 pages of: `lucas`, `turbidity`,
  `victor meyer`, `iodoform`, `socl2`, `thionyl`, `pcl5`. Those questions
  correctly get **no book citation** (the lectures do cover Lucas test, so the
  video panel still fires). This is honest abstention, not a bug.
- **Extracted text carries diagram debris.** pypdf flattens bond-line
  structures into fragments like `H C3 H C3 H H`. Excerpts are readable and
  topically correct but visibly noisy. Aggressive filtering was losing real
  reagent/formula tokens that students search for, so noise was preferred over
  missing content. Section *labels* are filtered (see `looksLikeFormulaDebris`).
- Lecture pool covers Alcohol + Grignard playlists only, so off-topic questions
  (aromaticity, isomerism) get a book page and no video, by design.

## Measured state

- Book: 993 chunks from 592 text-bearing pages.
- Video: 1,244 caption-aligned segments across 17 real videos.
- Retrieval smoke checks include Iodoform, Lucas, Williamson, Grignard + ester,
  hydroboration, and alcohol oxidation (`npm run retrieval:check`).

## Demo boundary

The local index and models make this unsuitable for the existing Vercel-only
deployment without adding a persistent Python host. That infrastructure is
intentionally out of scope for the showcase build.
