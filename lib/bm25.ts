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
  // The book abbreviates "alkaline" as "alk" ("alk KMnO 4"), so a student
  // typing the full word would otherwise miss it entirely — "alkaline" has
  // zero occurrences in the extracted text while the reaction is covered.
  [/\b(?:alkaline|alkali|alk)\b/g, "alkaline"],
  [/\b(?:baeyer|bayer)\b/g, "baeyer"],
];

// Includes generic question vocabulary, not just classic stopwords.
//
// This matters for the relevance gate: a word like "immediately" or "convert"
// is statistically rare inside a chemistry corpus, so IDF alone rates it as
// highly discriminative — but it carries no topical meaning. Left in, it let
// "Why does the Lucas test give turbidity immediately for tertiary alcohols?"
// earn a citation from an unrelated chapter purely on the word "immediately".
// Statistical rarity in a domain corpus is not the same as topical
// significance, so these are removed before scoring.
const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "for", "and", "or", "to", "is", "are",
  "with", "by", "at", "this", "that", "it", "its", "as", "be", "was", "were",
  "from", "does", "do", "did", "why", "how", "what", "when", "which", "who",
  "sir", "please", "explain", "tell", "me", "my", "i", "you", "we", "can",
  "will", "would", "should", "if", "then", "than", "there", "here", "so",
  "but", "not", "no", "yes", "also", "very", "more", "most", "some", "any",
  "give", "get", "using", "use", "used", "between", "difference", "differ",
  // Generic question/answer verbs and adverbs
  "immediately", "quickly", "slowly", "faster", "fast", "slower", "slow",
  "convert", "converted", "converts", "conversion", "form", "forms", "formed",
  "happen", "happens", "happened", "occur", "occurs", "called", "call",
  "work", "works", "working", "mean", "means", "meaning", "result", "results",
  "example", "examples", "help", "helps", "need", "needs", "want", "make",
  "makes", "made", "take", "takes", "put", "show", "shows", "shown", "know",
  "understand", "doubt", "question", "answer", "step", "steps", "way", "ways",
  "good", "best", "better", "many", "much", "about", "into", "over", "under",
  "during", "after", "before", "still", "even", "only", "just", "actually",
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

export type Bm25Options = {
  /**
   * Multiplier applied to the IDF charged for a query term that appears
   * nowhere in this corpus (see queryCoverage). 1.0 means "absence is full
   * evidence the corpus doesn't cover this".
   *
   * Lower it for a corpus in a different language than the queries. The
   * lecture transcripts are Hindi ASR, where English technical terms are
   * routinely absent or mangled ("ethanol", "formaldehyde", "zaitsev" simply
   * aren't in the Devanagari text even when the lecturer teaches exactly that
   * topic). At full penalty this rejected demonstrably correct matches — the
   * "Phenol" lecture moment scored only 0.21 coverage for a phenol question.
   * The English book prose has no such excuse, so it keeps the full penalty.
   */
  oovPenalty?: number;
};

export class Bm25Index {
  private docs: IndexedDoc[] = [];
  private df = new Map<string, number>();
  private avgLength = 0;
  private byId = new Map<string, IndexedDoc>();
  private oovPenalty: number;

  constructor(docs: Bm25Doc[], options: Bm25Options = {}) {
    this.oovPenalty = options.oovPenalty ?? 1;
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

  /** IDF assigned to a query term that appears nowhere in the corpus. */
  private oovIdf(): number {
    return Math.log(1 + (this.docs.length + 0.5) / 0.5) * this.oovPenalty;
  }

  /**
   * Fraction of the query's total "importance mass" that this document matches,
   * where importance is IDF and a term absent from the corpus counts as
   * maximally important *and* unmatched.
   *
   * That last part is the crux. Simpler gates kept failing in one direction or
   * the other:
   *   - Counting matched terms was too lax on long questions and too strict on
   *     short ones.
   *   - Taking the best matched term's IDF still leaked, because a generic word
   *     ("test", "immediately") is statistically rare inside a chemistry corpus
   *     and therefore looks discriminative while carrying no topical meaning.
   *
   * Both leaks share a root cause: when the term that defines the question is
   * absent from the corpus, ignoring it lets the leftover generic words account
   * for 100% of what remains, so an unrelated chapter looks like a full match.
   * Charging absent terms at maximum IDF turns their absence into exactly the
   * signal it should be, "this book does not cover what was asked", and drives
   * coverage down instead of up.
   *
   * Returns 0..1.
   */
  queryCoverage(docId: string, query: string): number {
    const doc = this.byId.get(docId);
    if (!doc) return 0;
    const terms = new Set(tokenize(query));
    if (terms.size === 0) return 0;

    const oov = this.oovIdf();
    let matched = 0;
    let total = 0;
    for (const term of terms) {
      const inCorpus = (this.df.get(term) ?? 0) > 0;
      const weight = inCorpus ? this.idf(term) : oov;
      total += weight;
      if (doc.freqs.has(term)) matched += weight;
    }
    return total > 0 ? matched / total : 0;
  }
}
