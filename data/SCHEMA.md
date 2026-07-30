# Retrieval data schema

## `video-chunks-v2.json`

Each entry is a caption-derived lecture segment. `startSeconds` and
`endSeconds` are taken from the first and last included YouTube caption cues;
they are not LLM-generated estimates.

```ts
type VideoChunk = {
  id: string;
  videoId: string;
  videoTitle: string;
  lecture: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  topic: string;
  keywords: string[];
};
```

## `book-chunks-v2.json`

Every chunk stays within one printed book page.

```ts
type BookChunk = {
  id: string;
  page: number;
  section: string;
  text: string;
  keywords: string[];
};
```

## Supporting data

- `videos.json`: playlist display metadata.
- `book-pages.json`: extracted text keyed by printed page.
- `raw/*.json`: source caption cues used to build lecture segments.

The frontend loads the two V2 chunk files only to resolve source IDs and render
the lecture/book panels. Search is performed by the local Python retrieval
service over `backend/data/documents.jsonl` and its persisted Qdrant index.
