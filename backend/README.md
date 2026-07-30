# Retrieval service

The demo uses a persisted local Qdrant index with multilingual dense retrieval,
BM25 sparse retrieval, reciprocal-rank fusion, and a multilingual cross-encoder
reranker.

```powershell
npm run retrieval:setup
npm run dev
```

`retrieval:setup` rebuilds page-safe book chunks and caption-cue lecture
segments, downloads the local embedding/reranking models on first use, and
creates the ignored `backend/.qdrant` index.
