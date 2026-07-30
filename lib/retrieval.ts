import type { BookChunk, VideoChunk } from "./types";
import { bookChunks, videoChunks } from "./data";

// Online search lives in the local Qdrant service. These helpers only power
// source-panel navigation after the answer has cited a specific chunk.
export function relatedBookChunks(chunk: BookChunk | undefined, max = 10): BookChunk[] {
  if (!chunk) return [];
  return bookChunks
    .filter((candidate) => candidate.chapterNumber === chunk.chapterNumber)
    .sort((a, b) => Math.abs(a.page - chunk.page) - Math.abs(b.page - chunk.page))
    .slice(0, max)
    .sort((a, b) => a.page - b.page);
}

export function relatedVideoChunks(chunk: VideoChunk | undefined, max = 8): VideoChunk[] {
  if (!chunk) return [];

  const labels = new Set(chunk.keywords.map((keyword) => keyword.toLowerCase()));
  const topicTerms = new Set(
    chunk.topic.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3)
  );
  const ranked = videoChunks
    .filter((candidate) => candidate.id !== chunk.id)
    .map((candidate) => {
      const labelOverlap = candidate.keywords.filter((keyword) =>
        labels.has(keyword.toLowerCase())
      ).length;
      const topicOverlap = candidate.topic
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => topicTerms.has(term)).length;
      return { candidate, score: labelOverlap * 5 + topicOverlap };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  // Show one strong moment per lecture first. Previously every option was
  // restricted to the active video, which made the recommendations look stuck.
  const results = [chunk];
  const includedVideos = new Set([chunk.videoId]);
  for (const { candidate } of ranked) {
    if (includedVideos.has(candidate.videoId)) continue;
    results.push(candidate);
    includedVideos.add(candidate.videoId);
    if (results.length >= max) return results;
  }

  // A niche concept may exist in only a few lectures. Fill remaining slots
  // with distinct matching moments rather than unrelated videos.
  for (const { candidate } of ranked) {
    if (results.some((result) => result.id === candidate.id)) continue;
    results.push(candidate);
    if (results.length >= max) break;
  }
  return results;
}
