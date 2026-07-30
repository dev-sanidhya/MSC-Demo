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

```
scripts/            # Offline build-time pipeline (run manually, output committed)
  videos.config.mjs      # Source-of-truth list of 17 lecture videos
  keyword-dictionary.mjs # Curated chemistry keyword dictionary (shared)
  fetch-transcripts.mjs  # Hindi ASR transcripts -> data/raw/{videoId}.json
  chunk-transcripts.mjs  # -> data/video-chunks.json (619 chunks) + videos.json
  extract-book.py        # 602-page PDF -> data/book-pages.json (592 pages)
  chunk-book.mjs         # -> data/book-chunks.json (671 chunks)
  eval-retrieval.mts     # Offline retrieval eval (imports real prod modules)

lib/
  bm25.ts           # BM25 ranking + domain synonym canonicalisation
  retrieval.ts      # Gated retrieval over both pools
  data.ts           # Loads the committed JSON datasets
  paneTree.ts       # Tiling pane tree for split-view chats

app/api/chat/route.ts  # Retrieval -> Groq (streaming SSE)
```

Retrieval is deliberately **LLM-free and offline**: BM25 over in-memory indexes,
no embeddings service, no vector DB, no network. The video/book panels therefore
keep working even if the Groq API is down or rate-limited, which was a hard
requirement for a live demo on a free-tier key.

## Key decisions and why

- **Full-text extraction, not hand-written summaries.** Following
  open-notebook's ingestion model. The original implementation hand-wrote 27
  summary chunks covering 18 of 602 pages (~1% of the book), which is why every
  question returned the same handful of pages. Now 671 chunks over 490 pages.
- **Chunking**: recursive separator ladder, ~400-token chunks, 15% overlap,
  min-size filter (ported from open-notebook's `utils/chunking.py`).
- **Page provenance** is tracked through chunking via a char-offset -> printed
  page map, because a chunk that cannot name its page cannot be cited.
  Printed page != PDF index (8 pages of front matter).
- **Coverage-based relevance gate** rather than matched-term counts. Absent
  query terms are charged maximum IDF, so a question whose defining term the
  book never mentions retrieves nothing instead of a confidently wrong page.
- **Per-corpus OOV penalty**: full for the English book, discounted (0.3) for
  the Hindi-ASR transcripts, where an English term's absence is weak evidence.
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

- Book: 671 chunks / 490 distinct pages / 98.4% of chunks verified present on
  the page they cite.
- Video: 619 chunks across 17 real videos, timestamp deep-linked.
- Eval (`npx tsx scripts/eval-retrieval.mts`), 30 realistic questions:
  23/30 book citations, 14/30 lecture citations, **34 distinct book pages**
  (was the same 2-3 for everything).
- Covered/uncovered split battery: 20/20.

## Next steps

- Optional: semantic (embedding) arm alongside BM25 for paraphrase recall.
  Deferred deliberately - a local model adds serverless cold-start risk, and
  BM25 over the real full text already fixed the reported problem.
- Book coverage gaps for named qualitative tests would need a different
  Chouhan volume; the current PDF genuinely lacks them.
