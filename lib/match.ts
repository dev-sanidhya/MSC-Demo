// Keyword-overlap retrieval over the real video/book chunk pools
// (data/video-chunks.json, data/book-chunks.json). Deliberately not an LLM
// call — this runs offline/instantly so the video and book panels never
// depend on the Groq API being up, and the LLM only ever sees the one
// chunk this picks rather than the full transcript/book.

import type { BookChunk, VideoChunk } from "./types";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "for", "and", "or", "to", "is", "are",
  "with", "by", "at", "this", "that", "it", "its", "as", "be", "was", "were",
  "from", "does", "do", "did", "why", "how", "what", "when", "sir", "please",
]);

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Query token set, plus naive singular forms so "alcohols" also matches "alcohol". */
function expandedQuerySet(tokens: string[]): Set<string> {
  const set = new Set(tokens);
  for (const t of tokens) {
    if (t.length > 3 && t.endsWith("s")) set.add(t.slice(0, -1));
  }
  return set;
}

function titleTokens(text: string): string[] {
  return normalize(text).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Scores a chunk against a student's question using two signals: explicit
 * keyword/phrase hits (strongest) plus overlap with the chunk's own
 * topic/section title (breaks ties toward the chunk that's actually "about"
 * what was asked, rather than whichever chunk happens first in the array).
 */
function score(queryTokens: string[], querySet: Set<string>, keywords: string[], title: string): number {
  const queryJoined = queryTokens.join(" ");
  let total = 0;
  for (const kw of keywords.map((k) => k.toLowerCase())) {
    if (kw.includes(" ")) {
      if (queryJoined.includes(kw)) total += 4;
    } else if (querySet.has(kw)) {
      total += 2;
    }
  }
  for (const word of titleTokens(title)) {
    if (querySet.has(word)) total += 1;
  }
  return total;
}

export function findBestVideoChunk(
  query: string,
  chunks: VideoChunk[],
  fallback?: VideoChunk
): VideoChunk | undefined {
  if (chunks.length === 0) return fallback;
  const tokens = normalize(query);
  const querySet = expandedQuerySet(tokens);
  let best: VideoChunk | undefined;
  let bestScore = 0;
  for (const chunk of chunks) {
    const s = score(tokens, querySet, chunk.keywords, chunk.topic);
    if (s > bestScore) {
      bestScore = s;
      best = chunk;
    }
  }
  return best ?? fallback;
}

export function findBestBookChunk(
  query: string,
  chunks: BookChunk[],
  fallback?: BookChunk
): BookChunk | undefined {
  if (chunks.length === 0) return fallback;
  const tokens = normalize(query);
  const querySet = expandedQuerySet(tokens);
  let best: BookChunk | undefined;
  let bestScore = 0;
  for (const chunk of chunks) {
    const s = score(tokens, querySet, chunk.keywords, chunk.section);
    if (s > bestScore) {
      bestScore = s;
      best = chunk;
    }
  }
  return best ?? fallback;
}

/** Deterministic "next" pick used to cycle chunks when no keyword match wins. */
export function nextInCycle<T extends { id: string }>(
  items: T[],
  currentId: string | undefined
): T | undefined {
  if (items.length === 0) return undefined;
  if (!currentId) return items[0];
  const idx = items.findIndex((i) => i.id === currentId);
  return items[(idx + 1) % items.length];
}
