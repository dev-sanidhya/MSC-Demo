# Vibrant Academy Chemistry Doubt Assistant

A demo chat experience grounded in M.S. Chouhan lecture transcripts and the
provided *Advanced Theory in Organic Chemistry for JEE* PDF. Answers can open
the cited lecture at the exact timestamp or show the cited book page.

## Run locally

Requirements: Node.js, Python 3.11+, and a Groq API key.

```powershell
Copy-Item .env.example .env.local
# Add GROQ_API_KEY to .env.local
npm install
npm run retrieval:setup
npm run dev
```

Open [http://localhost:3001](http://localhost:3001). The retrieval service runs
locally on port `8765` and `npm run dev` starts both processes.

The first setup downloads the embedding model and builds the
ignored local Qdrant index. Later runs only need `npm run dev`; rebuild the
index after changing source transcripts, the PDF extraction, or chunking.

## Retrieval architecture

- Lecture segments come directly from YouTube caption cues. Each citation keeps
  its real cue start/end time and deep-links to that timestamp.
- Book chunks never cross a printed-page boundary, so page citations remain
  exact.
- Qdrant fuses multilingual dense search and BM25 sparse search using reciprocal
  rank fusion.
- Exact named reactions and tests receive metadata boosts after hybrid fusion.
- The chat model receives compact source blocks and must cite their stable IDs.
  Only IDs actually used in the answer are shown in the source panels.

Useful checks:

```powershell
npm run retrieval:check
npm run lint
npm run build
```

Implementation details are in [backend/README.md](backend/README.md).
