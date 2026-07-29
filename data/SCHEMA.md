# Shared data schema — Vibrant Academy demo (Alcohol chapter)

## data/video-chunks.json
```ts
type VideoChunk = {
  id: string;            // e.g. "bsG6Egtznns-000"
  videoId: string;       // YouTube video id, e.g. "bsG6Egtznns"
  videoTitle: string;    // full YT title
  lecture: string;       // short label, e.g. "Lecture #1-A"
  startSeconds: number;
  endSeconds: number;
  text: string;          // cleaned transcript text for this chunk
  topic: string;         // short human-readable topic title for this chunk
  keywords: string[];    // lowercase keywords/phrases for retrieval
};
```
Top-level export: `VideoChunk[]`.

## data/videos.json (playlist metadata, used by UI even before transcripts land)
```ts
type VideoMeta = {
  videoId: string;
  title: string;
  lecture: string;
  durationSeconds: number;
  thumbnail: string; // https://i.ytimg.com/vi/{videoId}/hqdefault.jpg
};
```

## data/book-chunks.json (placeholder until PDF is provided — stub with empty array [])
```ts
type BookChunk = {
  id: string;
  page: number;
  section: string;   // e.g. "6.3 Preparation of Alcohols"
  text: string;
  keywords: string[];
};
```

Both video-chunks.json and book-chunks.json are consumed by a single retrieval
module (lib/retrieval.ts) that does keyword/TF-IDF scoring — no LLM calls.
