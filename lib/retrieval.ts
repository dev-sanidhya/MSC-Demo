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
  return videoChunks
    .filter((candidate) => candidate.videoId === chunk.videoId)
    .sort(
      (a, b) =>
        Math.abs(a.startSeconds - chunk.startSeconds) -
        Math.abs(b.startSeconds - chunk.startSeconds)
    )
    .slice(0, max)
    .sort((a, b) => a.startSeconds - b.startSeconds);
}
