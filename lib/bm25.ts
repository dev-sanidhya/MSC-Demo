// BM25 full-text ranking over the real book/lecture text.
//
// Why this replaces the previous scoring: the old matcher was designed for ~27
// hand-written summary chunks, each carrying a curated `keywords` array. It
// scored almost entirely on those tags. That approach cannot rank 671 chunks of
// actual book prose — most real chunks have few or no dictionary tags, and
// there is no notion of term rarity or document length, so long chunks and
// heavily-tagged chunks won every query regardless of topic.
//
// BM25 is the standard full-text relevance function and is what
// open-notebook's `fn::text_search` arm uses via SurrealDB. It gives us three
// things the old scorer lacked:
//   - IDF computed from the actual corpus, so "lucas" (rare) outweighs
//     "alcohol" (in nearly every chunk) without a hand-maintained generic list
//   - term-frequency saturation (k1), so repeating a word 20x doesn't score 20x
//   - document-length normalisation (b), so a long chunk isn't favoured just
//     for containing more words
//
// The index is small (~1300 docs total) so it is built once at module load and
// held in memory — no database, no network, no cold-start model download. That
// keeps retrieval independent of the LLM API being up, which was a hard
// requirement for the live demo.

const K1 = 1.2;
const B = 0.75;

export type Bm25Doc = {
  id: string;
  /** Free text to index (chunk body). */
  text: string;
  /** Short title/topic line; indexed with extra weight. */
  title?: string;
  /** Curated tags; indexed with extra weight. */
  keywords?: string[];
};

/**
 * Domain-aware synonym canonicalisation, applied to both documents and
 * queries so they meet on the same surface form.
 *
 * This matters more than usual here because the corpus mixes three
 * vocabularies: English book prose, Hinglish/Devanagari ASR transcripts, and
 * chemistry notation. A student typing "3 degree alcohol" must reach text
 * written "tertiary", "3°", or "टर्शरी".
 */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\b(?:3\s*°|3\s*degree|tertiary|tert|टर्शरी|तृतीयक)\b/g, "tertiary"],
  [/\b(?:2\s*°|2\s*degree|secondary|sec|सेकेंडरी|सेकंडरी|द्वितीयक)\b/g, "secondary"],
  [/\b(?:1\s*°|1\s*degree|primary|प्राइमरी|प्राथमिक)\b/g, "primary"],
  [/\b(?:grignard|rignard|rignore|rignar|ग्रिगनार्ड|ग्रिनार्ड|रिगना|रेजिना)\b/g, "grignard"],
  [/\b(?:lucas|लुकास)\b/g, "lucas"],
  [/\b(?:victor\s*meyer|विक्टर\s*मेयर)\b/g, "victormeyer"],
  [/\b(?:williamson|विलियमसन)\b/g, "williamson"],
  [/\b(?:iodoform|आयोडोफॉर्म)\b/g, "iodoform"],
  [/\b(?:dehydrat\w*|डिहाइड्रेशन)\b/g, "dehydration"],
  [/\b(?:hydrat\w*|हाइड्रेशन)\b/g, "hydration"],
  [/\b(?:oxidat\w*|oxidis\w*|oxidiz\w*|ऑक्सीडेशन|ऑक्सीकरण)\b/g, "oxidation"],
  [/\b(?:reduct\w*|reduc\w*|रिडक्शन)\b/g, "reduction"],
  [/\b(?:alcohols?|अल्कोहल)\b/g, "alcohol"],
  [/\b(?:phenols?|फिनॉल|फेनॉल)\b/g, "phenol"],
  [/\b(?:ethers?|ईथर)\b/g, "ether"],
  [/\b(?:aldehydes?|एल्डिहाइड)\b/g, "aldehyde"],
  [/\b(?:ketones?|कीटोन)\b/g, "ketone"],
  [/\b(?:carbocation\w*|कार्बोकैटायन|कार्बोकेशन)\b/g, "carbocation"],
  [/\b(?:mechanis\w*|मैकेनिज्म)\b/g, "mechanism"],
  [/\b(?:markovnikov|मार्कोनिकोव|मार्कोवनिकोव)\b/g, "markovnikov"],
  [/\b(?:zaitsev|saytzeff|जैतसेफ)\b/g, "zaitsev"],
  [/\b(?:esterificat\w*|एस्टरीफिकेशन)\b/g, "esterification"],
  [/\b(?:pinacol\w*|पिनाकोल)\b/g, "pinacol"],
  [/\b(?:epoxide|ऑक्साइड|एपॉक्साइड)\b/g, "epoxide"],
  [/\b(?:thionyl|socl2)\b/g, "thionylchloride"],
];

const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "for", "and", "or", "to", "is", "are",
  "with", "by", "at", "this", "that", "it", "its", "as", "be", "was", "were",
  "from", "does", "do", "did", "why", "how", "what", "when", "which", "who",
  "sir", "please", "explain", "tell", "me", "my", "i", "you", "we", "can",
  "will", "would", "should", "if", "then", "than", "there", "here", "so",
  "but", "not", "no", "yes", "also", "very", "more", "most", "some", "any",
  "give", "get", "using", "use", "used", "between", "difference", "differ",
  // Devanagari function words common in the ASR transcripts
  "है", "के", "का", "की", "को", "में", "से", "और", "यह", "हो", "तो", "एक",
  "ना", "पर", "हैं", "कि", "भी", "ही", "जो", "वह", "अब", "इस", "कर", "हम",
  "आप", "क्या", "कैसे", "क्यों", "नहीं", "बताओ", "देखो", "ये",
]);

/** Normalise, expand synonyms, and tokenise. Shared by indexing and querying. */
export function tokenize(input: string): string[] {
  let text = input.toLowerCase();
  for (const [pattern, replacement] of SYNONYMS) {
    text = text.replace(pattern, replacement);
  }
  // Keep latin alphanumerics (chemistry formulas like h2so4, kmno4, sn1) and
  // Devanagari; everything else becomes a separator.
  const raw = text
    .replace(/[^a-z0-9ऀ-ॿ\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  const out: string[] = [];
  for (const tok of raw) {
    if (tok.length < 2) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
    // Cheap plural stripping so "alkenes" also matches "alkene". Applied after
    // the synonym pass, which already handles the irregular chemistry terms.
    if (tok.length > 4 && tok.endsWith("s") && !tok.endsWith("ss")) {
      out.push(tok.slice(0, -1));
    }
  }
  return out;
}

type IndexedDoc = {
  id: string;
  length: number;
  /** term -> weighted frequency within this doc */
  freqs: Map<string, number>;
};

export class Bm25Index {
  private docs: IndexedDoc[] = [];
  private df = new Map<string, number>();
  private avgLength = 0;
  private byId = new Map<string, IndexedDoc>();

  constructor(docs: Bm25Doc[]) {
    for (const doc of docs) {
      const freqs = new Map<string, number>();
      const add = (text: string, weight: number) => {
        for (const term of tokenize(text)) {
          freqs.set(term, (freqs.get(term) ?? 0) + weight);
        }
      };
      // Title and curated keywords are strong topical signals, so they count
      // for more than an incidental mention in the body prose.
      add(doc.text, 1);
      if (doc.title) add(doc.title, 3);
      if (doc.keywords?.length) add(doc.keywords.join(" "), 3);

      const length = [...freqs.values()].reduce((a, b) => a + b, 0);
      const indexed: IndexedDoc = { id: doc.id, length, freqs };
      this.docs.push(indexed);
      this.byId.set(doc.id, indexed);
      for (const term of freqs.keys()) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
    }
    this.avgLength =
      this.docs.length > 0
        ? this.docs.reduce((sum, d) => sum + d.length, 0) / this.docs.length
        : 0;
  }

  private idf(term: string): number {
    const n = this.df.get(term) ?? 0;
    if (n === 0) return 0;
    // Standard BM25 IDF with the +1 smoothing that keeps it non-negative even
    // for terms appearing in more than half the corpus.
    return Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
  }

  /** Score every document against the query, best first. */
  search(query: string, limit = 10): Array<{ id: string; score: number }> {
    const terms = tokenize(query);
    if (terms.length === 0) return [];

    const scored: Array<{ id: string; score: number }> = [];
    for (const doc of this.docs) {
      let score = 0;
      for (const term of terms) {
        const f = doc.freqs.get(term);
        if (!f) continue;
        const idf = this.idf(term);
        if (idf <= 0) continue;
        const denom = f + K1 * (1 - B + (B * doc.length) / (this.avgLength || 1));
        score += idf * ((f * (K1 + 1)) / denom);
      }
      if (score > 0) scored.push({ id: doc.id, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /** How many query terms a document actually matched (used as a relevance gate). */
  matchedTermCount(docId: string, query: string): number {
    const doc = this.byId.get(docId);
    if (!doc) return 0;
    const unique = new Set(tokenize(query));
    let n = 0;
    for (const term of unique) if (doc.freqs.has(term)) n += 1;
    return n;
  }
}
