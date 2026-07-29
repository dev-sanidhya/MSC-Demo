// scripts/chunk-transcripts.mjs
//
// Reads the raw per-video transcripts in data/raw/*.json (written by
// fetch-transcripts.mjs) and groups consecutive caption cues into
// topic-sized chunks (roughly 45s-150s of speech, breaking at natural
// pauses between captions where possible). For each chunk it derives a
// human-readable `topic` and a `keywords` array using a curated, LLM-free
// keyword dictionary (scripts/keyword-dictionary.mjs) plus a simple
// frequency-based fallback so every chunk has at least some retrieval
// keywords even when no dictionary term matches.
//
// Output: data/video-chunks.json (VideoChunk[]) and data/videos.json
// (VideoMeta[]), matching data/SCHEMA.md exactly.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIDEOS } from "./videos.config.mjs";
import { KEYWORD_DICTIONARY } from "./keyword-dictionary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "data", "raw");
const DATA_DIR = path.join(__dirname, "..", "data");

// --- Chunking parameters (seconds) ---
const TARGET_MIN_SECONDS = 45; // don't close a chunk before this unless forced (last cue)
const HARD_MAX_SECONDS = 150; // force-close a chunk at this length regardless of pause
const PAUSE_GAP_SECONDS = 0.5; // a gap of >= this between cues counts as a natural break
const MIN_TAIL_SECONDS = 20; // trailing leftover shorter than this gets merged into previous chunk
const BIG_GAP_SECONDS = 8; // a silence this long (board-writing, working a problem) is a forced topic boundary
const MAX_MERGED_SECONDS = 180; // never merge two short chunks together if the result would exceed this

// --- Stopwords for the frequency-based fallback keyword extraction ---
// Mix of common Hindi function words (as they appear in Devanagari ASR
// output) and common English filler words, since transcripts code-switch.
const STOPWORDS = new Set([
  // Hindi (Devanagari) function words / fillers
  "है", "के", "का", "की", "को", "में", "से", "और", "यह", "हो", "तो", "एक",
  "हूं", "ना", "पर", "हैं", "था", "थी", "थे", "कि", "भी", "ही", "जो", "वह",
  "अब", "इस", "उस", "कर", "करो", "करते", "करना", "गया", "गई", "गए", "दिया",
  "दो", "दे", "हम", "आप", "मैं", "मुझे", "अपने", "इसके", "उसके", "यहाँ",
  "वहाँ", "क्या", "कैसे", "क्यों", "सब", "सभी", "बात", "वाला", "वाली",
  "बहुत", "फिर", "अगर", "लिए", "साथ", "जाएगा", "जाएगी", "होगा", "होगी",
  "बोलो", "देखो", "समझ", "समझो", "ठीक", "अच्छा", "यार", "बस", "सर", "जी",
  "नहीं", "बताओ", "आपको", "मतलब", "होता", "होती", "होते", "दोनों", "पहले",
  "अभी", "अगले", "नेक्स्ट", "लिखो", "लिख", "लिया", "डालोगे", "रखते", "पढ़",
  "हमारा", "सकते", "बनेगा", "बना", "गाय", "आज", "दोस्त", "अपन",
  // English fillers / generic connectors
  "the", "a", "an", "and", "or", "is", "are", "of", "in", "to", "for",
  "this", "that", "with", "on", "it", "we", "you", "so", "if", "then",
  "will", "can", "here", "now", "here's", "okay", "ok", "yes", "no",
]);

function formatMMSS(totalSeconds) {
  const s = Math.round(totalSeconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function chunkCues(cues) {
  const chunks = [];
  let current = [];

  const closeCurrent = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = [];
    }
  };

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    current.push(cue);

    const chunkStart = current[0].offset;
    const cueEnd = cue.offset + cue.duration;
    const durationSoFar = (cueEnd - chunkStart) / 1000;

    const nextCue = cues[i + 1];
    const gapToNext = nextCue ? (nextCue.offset - cueEnd) / 1000 : Infinity;
    const isLastCue = i === cues.length - 1;

    if (durationSoFar >= HARD_MAX_SECONDS) {
      closeCurrent();
      continue;
    }

    // A long silence before the next cue (lecturer writing on the board,
    // solving a problem silently, etc.) is a strong natural topic boundary -
    // force a break here even if we have not hit TARGET_MIN_SECONDS yet, so
    // that dead air never gets counted as part of a chunk's on-screen span.
    if (gapToNext >= BIG_GAP_SECONDS) {
      closeCurrent();
      continue;
    }

    if (durationSoFar >= TARGET_MIN_SECONDS && (gapToNext >= PAUSE_GAP_SECONDS || isLastCue)) {
      closeCurrent();
      continue;
    }
  }
  closeCurrent();

  // Second pass: merge any chunk that ended up too short (e.g. because a
  // BIG_GAP_SECONDS silence forced an early break) into its neighbor, so we
  // don't emit degenerate few-second chunks. Prefer merging forward into the
  // next chunk; fall back to merging backward for the final chunk. Skip a
  // merge that would push the combined chunk's wall-clock span past
  // MAX_MERGED_SECONDS - a lone short trailing fragment (e.g. one stray
  // word after a multi-minute silence at a video's end) is a better outcome
  // than a multi-minute chunk that is mostly dead air.
  const spanSeconds = (group) =>
    (group[group.length - 1].offset + group[group.length - 1].duration - group[0].offset) / 1000;

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < chunks.length; i++) {
      const group = chunks[i];
      const duration = spanSeconds(group);
      if (duration < MIN_TAIL_SECONDS && chunks.length > 1) {
        if (i < chunks.length - 1 && spanSeconds([...group, ...chunks[i + 1]]) <= MAX_MERGED_SECONDS) {
          chunks[i + 1] = [...group, ...chunks[i + 1]];
          chunks.splice(i, 1);
          merged = true;
          break;
        } else if (i > 0 && spanSeconds([...chunks[i - 1], ...group]) <= MAX_MERGED_SECONDS) {
          chunks[i - 1] = [...chunks[i - 1], ...group];
          chunks.splice(i, 1);
          merged = true;
          break;
        }
        // Neither neighbor merge stays within MAX_MERGED_SECONDS - leave
        // this short chunk standalone rather than creating a bloated one.
      }
    }
  }

  return chunks;
}

function deriveTopicAndKeywords(text, lecture, startSeconds) {
  const lowerText = text.toLowerCase();

  const matched = [];
  for (const entry of KEYWORD_DICTIONARY) {
    const hit = entry.patterns.some((p) => lowerText.includes(p.toLowerCase()));
    if (hit) matched.push(entry);
  }

  // Dedup by keyword (patterns can overlap, e.g. "sn1" appears in both
  // "sn1 mechanism" and "sn1 vs sn2" entries - both are fine to keep since
  // they represent distinct retrieval keywords, but avoid pushing the same
  // keyword twice).
  const seen = new Set();
  const dedupedMatches = matched.filter((m) => {
    if (seen.has(m.keyword)) return false;
    seen.add(m.keyword);
    return true;
  });

  let topic;
  if (dedupedMatches.length > 0) {
    const topLabels = dedupedMatches.slice(0, 3).map((m) => m.label);
    topic = topLabels.join(" — ");
  } else {
    topic = `${lecture} — ${formatMMSS(startSeconds)}`;
  }

  const dictKeywords = dedupedMatches.map((m) => m.keyword);

  // Frequency-based fallback keywords from the raw chunk text, so retrieval
  // still has *something* to match against even for chunks with no
  // dictionary hits (and to enrich chunks that do have hits).
  const tokens = text
    .split(/[\s,।.!?()"']+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !STOPWORDS.has(t.toLowerCase()));

  const freq = new Map();
  for (const t of tokens) {
    const key = t.toLowerCase();
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  const fallbackKeywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .filter((word) => !dictKeywords.includes(word))
    .slice(0, 5);

  const keywords = [...new Set([...dictKeywords, ...fallbackKeywords])];

  return { topic, keywords };
}

async function main() {
  let rawFiles;
  try {
    rawFiles = await readdir(RAW_DIR);
  } catch {
    rawFiles = [];
  }
  const rawFileSet = new Set(rawFiles.filter((f) => f.endsWith(".json")));

  const allChunks = [];
  const chunkCountByVideo = {};

  for (const video of VIDEOS) {
    const rawFileName = `${video.videoId}.json`;
    if (!rawFileSet.has(rawFileName)) {
      console.warn(`No raw transcript found for ${video.videoId} (${video.lecture}) - skipping chunking.`);
      chunkCountByVideo[video.videoId] = 0;
      continue;
    }

    const raw = JSON.parse(await readFile(path.join(RAW_DIR, rawFileName), "utf-8"));
    // Drop non-verbal ASR markers like "[संगीत]" (music) / "[प्रशंसा]" (applause) -
    // these carry no retrievable content and their cues sometimes have huge
    // durations (silence padding) that would otherwise blow up chunk sizes.
    const cues = (raw.cues ?? []).filter((c) => !/^\[[^\]]*\]$/.test(c.text.trim()));
    if (cues.length === 0) {
      console.warn(`Raw transcript for ${video.videoId} has zero cues - skipping.`);
      chunkCountByVideo[video.videoId] = 0;
      continue;
    }

    const cueGroups = chunkCues(cues);

    cueGroups.forEach((group, idx) => {
      const startSeconds = Math.round(group[0].offset / 1000);
      const lastCue = group[group.length - 1];
      const endSeconds = Math.round((lastCue.offset + lastCue.duration) / 1000);
      const text = group.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();

      const { topic, keywords } = deriveTopicAndKeywords(text, video.lecture, startSeconds);

      allChunks.push({
        id: `${video.videoId}-${String(idx).padStart(3, "0")}`,
        videoId: video.videoId,
        videoTitle: video.title,
        lecture: video.lecture,
        startSeconds,
        endSeconds,
        text,
        topic,
        keywords,
      });
    });

    chunkCountByVideo[video.videoId] = cueGroups.length;
  }

  const videosOut = VIDEOS.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    lecture: v.lecture,
    durationSeconds: v.durationSeconds,
    thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
  }));

  await writeFile(
    path.join(DATA_DIR, "video-chunks.json"),
    JSON.stringify(allChunks, null, 2),
    "utf-8"
  );
  await writeFile(
    path.join(DATA_DIR, "videos.json"),
    JSON.stringify(videosOut, null, 2),
    "utf-8"
  );

  console.log("=== Chunking summary ===");
  let total = 0;
  for (const video of VIDEOS) {
    const count = chunkCountByVideo[video.videoId] ?? 0;
    total += count;
    console.log(`  ${video.videoId}  ${video.lecture}: ${count} chunks`);
  }
  console.log(`Total chunks: ${total}`);
  console.log(`Wrote ${allChunks.length} chunks to data/video-chunks.json`);
  console.log(`Wrote ${videosOut.length} video entries to data/videos.json`);
}

main().catch((err) => {
  console.error("Fatal error in chunk-transcripts.mjs:", err);
  process.exitCode = 1;
});
