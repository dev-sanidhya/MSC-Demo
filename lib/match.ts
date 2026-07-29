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

// Deduped: a title that happens to repeat a word (e.g. "Oxidation of
// Alcohol — Primary Alcohol — Secondary Alcohol" says "alcohol" three
// times) must not collect that word's title bonus three times over.
function titleTokens(text: string): string[] {
  const tokens = normalize(text).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

// Terms that are semantically chapter-wide (every chunk in an "Alcohols"
// pool touches primary/secondary/tertiary classification, or aldehydes and
// ketones as reaction products) even when the auto-tagging pipeline only
// happened to attach them to a handful of chunks. Raw document-frequency
// from a small, unevenly-tagged corpus is too noisy to trust for these —
// domain knowledge says they should never be a strong signal, so they're
// pinned to a low fixed weight instead of computed IDF.
const GENERIC_KEYWORDS = new Set([
  "primary alcohol", "secondary alcohol", "tertiary alcohol", "alcohol",
  "aldehyde", "ketone", "mechanism", "reagent", "stability",
  "reaction intermediate", "sn1 mechanism", "sn2 mechanism",
]);
const GENERIC_KEYWORD_WEIGHT = 0.6;

/**
 * Inverse-document-frequency weight per keyword, computed over the pool
 * being searched: a keyword that shows up on nearly every chunk is nearly
 * useless for distinguishing which chunk is relevant, so it should count
 * for far less than a keyword that only appears on 2-3 chunks (e.g. "lucas
 * test", "williamson"). Without this, a chunk tagged with many broad,
 * generic keywords wins by sheer volume regardless of whether it's
 * actually on-topic.
 */
function buildIdf(chunks: { keywords: string[] }[]): Map<string, number> {
  const docFreq = new Map<string, number>();
  for (const c of chunks) {
    for (const kw of new Set(c.keywords.map((k) => k.toLowerCase()))) {
      docFreq.set(kw, (docFreq.get(kw) ?? 0) + 1);
    }
  }
  const n = Math.max(chunks.length, 1);
  const idf = new Map<string, number>();
  for (const [kw, freq] of docFreq) {
    if (GENERIC_KEYWORDS.has(kw)) {
      idf.set(kw, GENERIC_KEYWORD_WEIGHT);
      continue;
    }
    idf.set(kw, Math.max(Math.log((n + 1) / (freq + 0.5)), 0.05));
  }
  return idf;
}

/**
 * Scores a chunk against a student's question: explicit keyword/phrase hits
 * (weighted by rarity via idf) plus overlap with the chunk's own
 * topic/section title, which breaks ties toward the chunk that's actually
 * "about" what was asked rather than whichever chunk has the most keywords.
 */
// Only the top N keyword hits count. Without this, a chunk that happens to
// be tagged with several co-occurring classification terms (e.g. "primary
// alcohol" + "secondary alcohol" + "tertiary alcohol" + "aldehyde" +
// "ketone" all at once) racks up matches on breadth alone and out-scores a
// chunk with just one genuinely specific, on-topic keyword — capping keeps
// precision competitive with volume.
const MAX_SCORED_KEYWORD_HITS = 2;

function score(
  queryTokens: string[],
  querySet: Set<string>,
  keywords: string[],
  title: string,
  idf: Map<string, number>
): { total: number; hasKeywordHit: boolean } {
  const queryJoined = queryTokens.join(" ");
  const hits: number[] = [];
  for (const kw of keywords.map((k) => k.toLowerCase())) {
    const weight = idf.get(kw) ?? 1;
    if (kw.includes(" ")) {
      if (queryJoined.includes(kw)) hits.push(4 * weight);
    } else if (querySet.has(kw)) {
      hits.push(2 * weight);
    }
  }
  hits.sort((a, b) => b - a);
  let total = hits.slice(0, MAX_SCORED_KEYWORD_HITS).reduce((a, b) => a + b, 0);
  for (const word of titleTokens(title)) {
    if (querySet.has(word)) total += 1;
  }
  return { total, hasKeywordHit: hits.length > 0 };
}

// A chunk only counts as "relevant" if it scored at least one real tagged
// keyword hit (not just incidental title-word overlap) and clears this
// floor — otherwise we'd rather show no clip/no excerpt than a confidently
// wrong one for a topic this content pool genuinely doesn't cover.
const MIN_RELEVANT_SCORE = 3;

export function findBestVideoChunk(
  query: string,
  chunks: VideoChunk[],
  fallback?: VideoChunk
): VideoChunk | undefined {
  if (chunks.length === 0) return fallback;
  const tokens = normalize(query);
  const querySet = expandedQuerySet(tokens);
  const idf = buildIdf(chunks);
  let best: VideoChunk | undefined;
  let bestScore = 0;
  for (const chunk of chunks) {
    const { total, hasKeywordHit } = score(tokens, querySet, chunk.keywords, chunk.topic, idf);
    if (hasKeywordHit && total > bestScore) {
      bestScore = total;
      best = chunk;
    }
  }
  if (bestScore < MIN_RELEVANT_SCORE) return fallback;
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
  const idf = buildIdf(chunks);
  let best: BookChunk | undefined;
  let bestScore = 0;
  for (const chunk of chunks) {
    const { total, hasKeywordHit } = score(tokens, querySet, chunk.keywords, chunk.section, idf);
    if (hasKeywordHit && total > bestScore) {
      bestScore = total;
      best = chunk;
    }
  }
  if (bestScore < MIN_RELEVANT_SCORE) return fallback;
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
