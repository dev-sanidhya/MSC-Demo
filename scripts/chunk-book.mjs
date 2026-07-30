// scripts/chunk-book.mjs
//
// Stage 2 of the book pipeline: turn data/book-pages.json (full text, 592
// pages) into data/book-chunks.json — retrieval-sized chunks that each carry
// enough provenance to be cited as a real page reference.
//
// Chunking strategy is ported from open-notebook (lfnovo/open-notebook,
// open_notebook/utils/chunking.py), which uses LangChain's
// RecursiveCharacterTextSplitter with:
//   - a target chunk size (400 tokens there; ~1600 chars here, see below)
//   - 15% overlap, so a concept split across a boundary still appears whole
//     in one of the two neighbouring chunks
//   - a separator ladder, preferring to break at paragraph > line > sentence
//     > clause > word boundaries rather than mid-word
//   - a minimum-size filter that drops degenerate fragments
//
// We work in characters rather than tokens deliberately: tiktoken would be an
// extra dependency for a build-time script, and for this book chars/4 is a
// stable token proxy. 1600 chars ~= 400 tokens.
//
// The one thing open-notebook does NOT need but we absolutely do is PAGE
// PROVENANCE. A chunk that can't name its page can't be cited to a student.
// So instead of concatenating the whole book and splitting blindly, we build
// one text stream per chapter while recording a char-offset -> printed-page
// map, then resolve each chunk's offset back to the page(s) it came from.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KEYWORD_DICTIONARY } from "./keyword-dictionary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

// ~400 tokens at ~4 chars/token, matching open-notebook's default chunk size.
const CHUNK_SIZE = 1600;
const CHUNK_OVERLAP = Math.round(CHUNK_SIZE * 0.15); // 240
// Drop fragments this small: they're usually leftover diagram debris
// ("CH3 CH3 O") that adds noise to retrieval without adding meaning.
const MIN_CHUNK_CHARS = 200;

// Separator ladder, highest priority first (open-notebook's ordering).
const SEPARATORS = ["\n\n", "\n", ". ", ", ", " ", ""];

/**
 * RecursiveCharacterTextSplitter, reimplemented.
 *
 * Walks the separator ladder: split on the current separator, then greedily
 * pack pieces into chunks up to CHUNK_SIZE. Any single piece still too large
 * recurses onto the next (finer) separator. This is what keeps chunks from
 * being cut mid-sentence or mid-word.
 */
function splitText(text, chunkSize, overlap, separators = SEPARATORS) {
  if (text.length <= chunkSize) return [text];

  const [sep, ...rest] = separators;
  const pieces = sep === "" ? Array.from(text) : text.split(sep);

  const chunks = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current);
    current = "";
  };

  for (const piece of pieces) {
    const candidate = current ? current + sep + piece : piece;

    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }

    // Candidate overflows. Emit what we have, then deal with the piece.
    flush();

    if (piece.length > chunkSize) {
      // Single piece is oversized — recurse with a finer separator.
      if (rest.length > 0) {
        chunks.push(...splitText(piece, chunkSize, overlap, rest));
      } else {
        for (let i = 0; i < piece.length; i += chunkSize) {
          chunks.push(piece.slice(i, i + chunkSize));
        }
      }
    } else {
      current = piece;
    }
  }
  flush();

  // Apply overlap by prefixing each chunk with the tail of its predecessor.
  // Done as a post-pass so the packing logic above stays simple.
  if (overlap <= 0 || chunks.length < 2) return chunks;
  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;
    const prev = chunks[i - 1];
    const tail = prev.slice(Math.max(0, prev.length - overlap));
    return `${tail}${sep === "" ? "" : sep}${chunk}`;
  });
}

/**
 * Detect a human-readable section heading for a chunk.
 *
 * The book marks sections with all-caps lines ("METHODS OF PREPARATION",
 * "MECHANISM FOR THE CONVERSION OF AN ALKYNE TO A TRANS ALKENE") and with
 * bulleted title-case lines ("Physical Properties"). We scan the chunk for the
 * first such line; failing that the caller falls back to the chapter title, so
 * a chunk is never left without a citable section label.
 */
function detectSection(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 6 || line.length > 90) continue;
    const letters = line.replace(/[^A-Za-z]/g, "");
    if (letters.length < 5) continue;

    const upperRatio = letters.split("").filter((c) => c === c.toUpperCase()).length / letters.length;
    // All-caps heading (allow a few stray lowercase chars from OCR noise).
    if (upperRatio > 0.85) return toTitleCase(line);
    // Leading bullet glyph the book uses for sub-headings.
    if (/^[•●▪–—]\s*[A-Z]/.test(line)) return toTitleCase(line.replace(/^[•●▪–—]\s*/, ""));
  }
  return null;
}

function toTitleCase(s) {
  const cleaned = s
    .replace(/\s+/g, " ")
    .replace(/[:.]+$/, "")
    .trim();
  // Keep chemistry tokens (SN1, KMnO4, HBr) uppercase; title-case ordinary words.
  return cleaned
    .split(" ")
    .map((word) => {
      if (/\d/.test(word) || word.length <= 3) return word;
      if (word === word.toUpperCase()) {
        return word.charAt(0) + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(" ");
}

/**
 * Tag a chunk with retrieval keywords.
 *
 * Uses the same curated chemistry dictionary as the video-transcript pipeline
 * (scripts/keyword-dictionary.mjs) so book chunks and lecture chunks share a
 * vocabulary — that shared vocabulary is what lets one query score against
 * both pools coherently.
 */
function deriveKeywords(text) {
  const lower = text.toLowerCase();
  const matched = [];
  for (const entry of KEYWORD_DICTIONARY) {
    if (entry.patterns.some((p) => lower.includes(p.toLowerCase()))) {
      matched.push(entry.keyword);
    }
  }
  return [...new Set(matched)];
}

async function main() {
  const pages = JSON.parse(await readFile(path.join(DATA_DIR, "book-pages.json"), "utf-8"));
  console.log(`Loaded ${pages.length} pages`);

  // Group pages by chapter so chunks never straddle a chapter boundary.
  const byChapter = new Map();
  for (const page of pages) {
    if (!byChapter.has(page.chapterNumber)) byChapter.set(page.chapterNumber, []);
    byChapter.get(page.chapterNumber).push(page);
  }

  const chunks = [];
  let seq = 0;

  for (const [chapterNumber, chapterPages] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
    chapterPages.sort((a, b) => a.pdfPage - b.pdfPage);
    const chapterTitle = chapterPages[0].chapterTitle;

    // Build the chapter's text stream plus a char-offset -> page index.
    let stream = "";
    const offsets = []; // { start, end, page, pdfPage }
    for (const page of chapterPages) {
      const start = stream.length;
      stream += page.text + "\n\n";
      offsets.push({ start, end: stream.length, page: page.page, pdfPage: page.pdfPage });
    }

    const pieces = splitText(stream, CHUNK_SIZE, CHUNK_OVERLAP);

    // Resolve each chunk back to its page(s). We search for the chunk's text
    // in the stream rather than tracking offsets through the splitter, which
    // keeps the splitter itself generic and side-effect free.
    let searchFrom = 0;
    for (const piece of pieces) {
      const text = piece.trim();
      if (text.length < MIN_CHUNK_CHARS) continue;

      // Locate this chunk in the stream (probe on a distinctive middle slice
      // so overlap prefixes don't cause a false early match).
      const probe = piece.slice(Math.floor(piece.length / 3), Math.floor(piece.length / 3) + 60);
      let at = probe.trim() ? stream.indexOf(probe, searchFrom) : -1;
      if (at === -1) at = stream.indexOf(piece.slice(0, 60), searchFrom);
      if (at === -1) at = searchFrom;
      searchFrom = Math.max(searchFrom, at);

      const spanStart = at;
      const spanEnd = at + piece.length;
      const covered = offsets.filter((o) => o.end > spanStart && o.start < spanEnd);
      const span = covered.length > 0 ? covered : [offsets[0]];
      // Take min/max rather than first/last: printed-page detection can be
      // non-monotonic where a footer was unreadable and fell back to the
      // offset estimate, which would otherwise emit an inverted range
      // (page 50 -> pageEnd 46) and break citation lookups.
      const pageNums = span.map((o) => o.page);
      const first = { page: Math.min(...pageNums), pdfPage: Math.min(...span.map((o) => o.pdfPage)) };
      const last = { page: Math.max(...pageNums) };

      seq += 1;
      const section = detectSection(piece);
      chunks.push({
        id: `book-${String(seq).padStart(4, "0")}`,
        page: first.page,
        pageEnd: last.page,
        pdfPage: first.pdfPage,
        chapterNumber,
        chapterTitle,
        section: section
          ? `Ch. ${chapterNumber} ${chapterTitle} — ${section}`
          : `Ch. ${chapterNumber} ${chapterTitle}`,
        text,
        keywords: deriveKeywords(piece),
      });
    }
  }

  await writeFile(
    path.join(DATA_DIR, "book-chunks.json"),
    JSON.stringify(chunks, null, 1),
    "utf-8"
  );

  const sizes = chunks.map((c) => c.text.length);
  const tagged = chunks.filter((c) => c.keywords.length > 0).length;
  console.log(`\n=== Chunking summary ===`);
  console.log(`Chunks:            ${chunks.length}`);
  console.log(`Distinct pages:    ${new Set(chunks.map((c) => c.page)).size}`);
  console.log(`Chunk chars:       min=${Math.min(...sizes)} max=${Math.max(...sizes)} avg=${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)}`);
  console.log(`With keywords:     ${tagged}/${chunks.length}`);
  console.log(`Wrote data/book-chunks.json`);
}

main().catch((err) => {
  console.error("Fatal error in chunk-book.mjs:", err);
  process.exitCode = 1;
});
