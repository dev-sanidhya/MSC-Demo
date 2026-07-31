// Shared types for the Vibrant Academy demo UI.
// These mirror data/SCHEMA.md exactly so the real data (video-chunks.json,
// videos.json, book-chunks.json) can be swapped in for lib/mock-data.ts
// without touching any component code.

export type VideoChunk = {
  id: string; // e.g. "bsG6Egtznns-000"
  videoId: string; // YouTube video id, e.g. "bsG6Egtznns"
  videoTitle: string; // full YT title
  lecture: string; // short label, e.g. "Lecture #1-A"
  startSeconds: number;
  endSeconds: number;
  text: string; // cleaned transcript text for this chunk
  topic: string; // short human-readable topic title for this chunk
  keywords: string[]; // lowercase keywords/phrases for retrieval
};

export type VideoMeta = {
  videoId: string;
  title: string;
  lecture: string;
  durationSeconds: number;
  thumbnail: string; // https://i.ytimg.com/vi/{videoId}/hqdefault.jpg
};

export type BookChunk = {
  id: string;
  /** Printed page number as shown in the physical book — what a student looks up. */
  page: number;
  /** Last printed page this chunk spans (equals `page` for single-page chunks). */
  pageEnd: number;
  /** Index within the PDF file, which is offset from `page` by the front matter. */
  pdfPage: number;
  chapterNumber: number;
  chapterTitle: string;
  /** e.g. "Ch. 29 Alkene — Dehydration Of Alcohols" */
  section: string;
  sourceName: string;
  sourceTitle: string;
  url: string;
  text: string;
  keywords: string[];
};

// --- UI-only types (chat state), not part of the shared data schema ---

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** Set on assistant messages once a video/book chunk has been resolved for it. */
  videoChunkId?: string;
  bookChunkId?: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  /** Which video/book chunk the right-hand panels should currently display for this session. */
  activeVideoChunkId?: string;
  activeBookChunkId?: string;
  /** User manually closed the panel — hide it even though a chunk is resolved, until reopened. */
  videoDismissed?: boolean;
  bookDismissed?: boolean;
};
