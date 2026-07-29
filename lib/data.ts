// Real data only — no mock/seeded content. Loads the transcript-derived
// video chunks (data/video-chunks.json), playlist metadata (data/videos.json)
// and book chunks (data/book-chunks.json) produced by the offline pipeline.

import type { BookChunk, VideoChunk, VideoMeta } from "./types";
import videoChunksRaw from "@/data/video-chunks.json";
import videosRaw from "@/data/videos.json";
import bookChunksRaw from "@/data/book-chunks.json";

export const videos: VideoMeta[] = videosRaw as VideoMeta[];
export const videoChunks: VideoChunk[] = videoChunksRaw as VideoChunk[];
export const bookChunks: BookChunk[] = bookChunksRaw as BookChunk[];

/** Other moments from the same lecture, offered as quick alternatives in the video panel. */
export function relatedVideoChunks(chunk: VideoChunk | undefined, max = 8): VideoChunk[] {
  if (!chunk) return [];
  return videoChunks.filter((c) => c.videoId === chunk.videoId).slice(0, max);
}

/** Nearby book sections (by page), offered as quick alternatives in the book panel. */
export function relatedBookChunks(chunk: BookChunk | undefined, max = 10): BookChunk[] {
  if (!chunk) return [];
  return [...bookChunks]
    .sort((a, b) => Math.abs(a.page - chunk.page) - Math.abs(b.page - chunk.page))
    .slice(0, max)
    .sort((a, b) => a.page - b.page);
}
