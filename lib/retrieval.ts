// Retrieval over the real corpus: 671 book chunks (full 602-page text) and
// 619 lecture-transcript chunks.
//
// Replaces lib/match.ts, whose scoring was built for ~27 hand-written summary
// chunks and could not rank real prose (see lib/bm25.ts for the detailed why).
//
// Structure mirrors open-notebook's search layer: separate ranked pools per
// source type, each gated by a minimum relevance so an unmatched topic returns
// nothing rather than a confidently wrong citation, then the top-N of each is
// handed to the model as context.

import type { BookChunk, VideoChunk } from "./types";
import { Bm25Index } from "./bm25";
import { bookChunks, videoChunks } from "./data";

// Built once per process. ~1300 small docs, so this is milliseconds and needs
// no database or network — retrieval stays up even when the LLM API is down.
const bookIndex = new Bm25Index(
  bookChunks.map((c) => ({
    id: c.id,
    text: c.text,
    title: c.section,
    keywords: c.keywords,
  }))
);

const videoIndex = new Bm25Index(
  videoChunks.map((c) => ({
    id: c.id,
    text: c.text,
    title: c.topic,
    keywords: c.keywords,
  }))
);

const bookById = new Map(bookChunks.map((c) => [c.id, c]));
const videoById = new Map(videoChunks.map((c) => [c.id, c]));

/**
 * Relevance gates.
 *
 * A BM25 score is only meaningful relative to the corpus, so these were tuned
 * against the real question battery rather than picked a priori: high enough
 * that off-topic questions (thionyl chloride, which this book barely covers)
 * return nothing, low enough that genuine paraphrases still land. Requiring
 * two distinct matched query terms is the stronger of the two gates — it stops
 * a single incidental word from carrying a citation on its own.
 */
const MIN_SCORE = 2.0;
const MIN_MATCHED_TERMS = 2;

function gate<T>(
  index: Bm25Index,
  byId: Map<string, T>,
  query: string,
  limit: number
): T[] {
  const hits = index.search(query, limit * 3);
  const out: T[] = [];
  for (const hit of hits) {
    if (hit.score < MIN_SCORE) continue;
    // Single-term matches are usually incidental (e.g. the word "alcohol" in a
    // chapter that is not about the asked reaction).
    if (index.matchedTermCount(hit.id, query) < MIN_MATCHED_TERMS) continue;
    const doc = byId.get(hit.id);
    if (doc) out.push(doc);
    if (out.length >= limit) break;
  }
  return out;
}

/** Top book excerpts for a student question, best first. May be empty. */
export function findTopBookChunks(query: string, limit = 3): BookChunk[] {
  if (!query.trim()) return [];
  return gate(bookIndex, bookById, query, limit);
}

/** Top lecture moments for a student question, best first. May be empty. */
export function findTopVideoChunks(query: string, limit = 3): VideoChunk[] {
  if (!query.trim()) return [];
  return gate(videoIndex, videoById, query, limit);
}

/** Single best book excerpt, or undefined when nothing clears the gate. */
export function findBestBookChunk(query: string): BookChunk | undefined {
  return findTopBookChunks(query, 1)[0];
}

/** Single best lecture moment, or undefined when nothing clears the gate. */
export function findBestVideoChunk(query: string): VideoChunk | undefined {
  return findTopVideoChunks(query, 1)[0];
}

/**
 * Other excerpts near a cited one, for the "browse around this page" pills in
 * the book panel. Ordered by page so it reads like flipping through the book.
 */
export function relatedBookChunks(chunk: BookChunk | undefined, max = 10): BookChunk[] {
  if (!chunk) return [];
  return bookChunks
    .filter((c) => c.chapterNumber === chunk.chapterNumber)
    .sort((a, b) => Math.abs(a.page - chunk.page) - Math.abs(b.page - chunk.page))
    .slice(0, max)
    .sort((a, b) => a.page - b.page);
}

/** Other moments from the same lecture, for the video panel's switcher pills. */
export function relatedVideoChunks(chunk: VideoChunk | undefined, max = 8): VideoChunk[] {
  if (!chunk) return [];
  return videoChunks
    .filter((c) => c.videoId === chunk.videoId)
    .sort((a, b) => Math.abs(a.startSeconds - chunk.startSeconds) - Math.abs(b.startSeconds - chunk.startSeconds))
    .slice(0, max)
    .sort((a, b) => a.startSeconds - b.startSeconds);
}
