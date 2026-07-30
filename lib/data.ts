// Real data only, no mock/seeded content. Loads the transcript-derived
// video chunks (data/video-chunks.json), playlist metadata (data/videos.json)
// and book chunks (data/book-chunks.json) produced by the offline pipeline
// in scripts/ (fetch-transcripts, chunk-transcripts, extract-book, chunk-book).

import type { BookChunk, VideoChunk, VideoMeta } from "./types";
import videoChunksRaw from "@/data/video-chunks.json";
import videosRaw from "@/data/videos.json";
import bookChunksRaw from "@/data/book-chunks.json";

export const videos: VideoMeta[] = videosRaw as VideoMeta[];
export const videoChunks: VideoChunk[] = videoChunksRaw as VideoChunk[];
export const bookChunks: BookChunk[] = bookChunksRaw as BookChunk[];
