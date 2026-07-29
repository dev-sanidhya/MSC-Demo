// scripts/fetch-transcripts.mjs
//
// Fetches Hindi ASR transcripts for the 10 "Alcohol" chapter lecture videos
// (see videos.config.mjs) using the `youtube-transcript` npm package, with a
// manual watch-page-scraping fallback if that package fails for a given
// video. Writes one raw JSON file per successfully-fetched video to
// data/raw/{videoId}.json containing the un-chunked caption cues.
//
// This script never throws on a single video's failure - it logs and moves
// on to the next video, then prints a summary at the end.

import { fetchTranscript } from "youtube-transcript";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIDEOS } from "./videos.config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "data", "raw");

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Manual fallback: fetch the YouTube watch page HTML directly, pull the
 * captionTracks list out of ytInitialPlayerResponse, prefer a Hindi track,
 * then fetch the timedtext baseUrl with fmt=json3 and parse it ourselves.
 */
async function fetchTranscriptManualFallback(videoId) {
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      "Accept-Language": "hi,en;q=0.9",
    },
  });
  if (!pageResp.ok) {
    throw new Error(`watch page HTTP ${pageResp.status}`);
  }
  const html = await pageResp.text();

  const marker = "ytInitialPlayerResponse = ";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) {
    throw new Error("ytInitialPlayerResponse not found in watch page");
  }
  const jsonStart = startIdx + marker.length;
  let depth = 0;
  let endIdx = -1;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx === -1) {
    throw new Error("could not isolate ytInitialPlayerResponse JSON");
  }
  const playerResponse = JSON.parse(html.slice(jsonStart, endIdx));
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error("no captionTracks in ytInitialPlayerResponse");
  }

  const hindiTrack =
    tracks.find((t) => t.languageCode === "hi") ??
    tracks.find((t) => t.languageCode?.startsWith("hi")) ??
    tracks[0];

  const baseUrl = hindiTrack.baseUrl;
  const timedTextUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=json3`;

  const captionResp = await fetch(timedTextUrl, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
  });
  if (!captionResp.ok) {
    throw new Error(`timedtext HTTP ${captionResp.status}`);
  }
  const captionJson = await captionResp.json();

  const cues = [];
  for (const event of captionJson.events ?? []) {
    if (!event.segs) continue;
    const text = event.segs
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    cues.push({
      text,
      offset: event.tStartMs ?? 0, // ms
      duration: event.dDurationMs ?? 0, // ms
    });
  }
  if (cues.length === 0) {
    throw new Error("timedtext returned zero usable cues");
  }
  return { cues, lang: hindiTrack.languageCode ?? "unknown" };
}

async function fetchOneVideo(video) {
  // Attempt 1: youtube-transcript package, explicitly asking for Hindi.
  try {
    const result = await fetchTranscript(video.videoId, { lang: "hi" });
    if (Array.isArray(result) && result.length > 0) {
      return {
        cues: result.map((r) => ({ text: r.text, offset: r.offset, duration: r.duration })),
        lang: result[0].lang ?? "hi",
        method: "youtube-transcript(lang=hi)",
      };
    }
  } catch (err) {
    console.warn(`  [${video.videoId}] youtube-transcript(lang=hi) failed: ${err.message}`);
  }

  // Attempt 2: youtube-transcript package, default (first available) track.
  try {
    const result = await fetchTranscript(video.videoId);
    if (Array.isArray(result) && result.length > 0) {
      return {
        cues: result.map((r) => ({ text: r.text, offset: r.offset, duration: r.duration })),
        lang: result[0].lang ?? "unknown",
        method: "youtube-transcript(default)",
      };
    }
  } catch (err) {
    console.warn(`  [${video.videoId}] youtube-transcript(default) failed: ${err.message}`);
  }

  // Attempt 3: manual watch-page HTML scrape + timedtext API fallback.
  try {
    const { cues, lang } = await fetchTranscriptManualFallback(video.videoId);
    return { cues, lang, method: "manual-watch-page-fallback" };
  } catch (err) {
    console.warn(`  [${video.videoId}] manual fallback failed: ${err.message}`);
  }

  return null;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  const results = [];

  for (const video of VIDEOS) {
    console.log(`Fetching transcript for ${video.lecture} (${video.videoId})...`);
    const fetched = await fetchOneVideo(video);

    if (!fetched) {
      console.error(`  FAILED: ${video.lecture} (${video.videoId}) - all fetch strategies exhausted`);
      results.push({ video, ok: false, cueCount: 0 });
      continue;
    }

    const outPath = path.join(RAW_DIR, `${video.videoId}.json`);
    await writeFile(
      outPath,
      JSON.stringify(
        {
          videoId: video.videoId,
          lecture: video.lecture,
          title: video.title,
          durationSeconds: video.durationSeconds,
          lang: fetched.lang,
          method: fetched.method,
          cues: fetched.cues,
        },
        null,
        2
      ),
      "utf-8"
    );

    console.log(
      `  OK: ${fetched.cues.length} cues via ${fetched.method} (lang=${fetched.lang}) -> ${path.relative(process.cwd(), outPath)}`
    );
    results.push({ video, ok: true, cueCount: fetched.cues.length });
  }

  console.log("\n=== Fetch summary ===");
  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log(`Succeeded: ${succeeded.length}/${results.length}`);
  for (const r of succeeded) {
    console.log(`  OK   ${r.video.videoId}  ${r.video.lecture}  (${r.cueCount} cues)`);
  }
  if (failed.length > 0) {
    console.log(`Failed: ${failed.length}/${results.length}`);
    for (const r of failed) {
      console.log(`  FAIL ${r.video.videoId}  ${r.video.lecture}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error in fetch-transcripts.mjs:", err);
  process.exitCode = 1;
});
