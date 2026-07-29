import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { videoChunks, bookChunks } from "@/lib/data";
import { findBestVideoChunk, findBestBookChunk } from "@/lib/match";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// A compact but complete JEE/NEET "Alcohols" syllabus primer, baked into
// every request so answer quality never depends on retrieval finding a
// perfect excerpt. The retrieved lecture/book excerpt (if any) is still the
// preferred source for citing "what Sir said" — this primer is the safety
// net that makes the model reliably correct even when it isn't.
const CHEMISTRY_KNOWLEDGE = `JEE/NEET "Alcohols" reference knowledge (ground every answer in this; it is authoritative):

NOMENCLATURE & CLASSIFICATION
- IUPAC: replace -e of parent alkane with -ol; lowest locant to -OH.
- Classified 1°/2°/3° by the number of carbons attached to the C bearing -OH. Also note benzylic and allylic alcohols behave like the analogous 1°/2°/3° alcohol but are extra reactive (stabilized carbocation) in SN1/E1 contexts.

PHYSICAL PROPERTIES
- Alcohols H-bond with each other and water → higher bp than alkanes/ethers of similar mass, and lower alcohols are water-miscible.
- bp increases with chain length and decreases with branching (less surface area, weaker van der Waals); bp order for isomers: 1° > 2° > 3°.
- Acidity: alcohols are weaker acids than water and phenols. Order: methanol > 1° > 2° > 3° (electron-donating alkyl/+I groups destabilize the alkoxide, and steric hindrance reduces solvation of the alkoxide). Phenols are far more acidic than alcohols due to resonance stabilization of the phenoxide ion.

PREPARATION
- Hydration of alkenes: acid-catalysed (Markovnikov, via carbocation, may rearrange) vs oxymercuration-demercuration (Markovnikov, no rearrangement) vs hydroboration-oxidation (anti-Markovnikov, syn addition, no rearrangement).
- Reduction of carbonyls: LiAlH4 (strong, reduces acids/esters/amides/nitriles too) or NaBH4 (mild, reduces aldehydes/ketones only, not esters/acids) — aldehydes → 1° alcohols, ketones → 2° alcohols.
- Grignard reactions: RMgX + HCHO → 1° alcohol; RMgX + other aldehyde → 2° alcohol; RMgX + ketone → 3° alcohol; RMgX + ester (2 equiv) → 3° alcohol; RMgX + epoxide → 1° alcohol with 2-carbon extension.
- Hydrolysis of alkyl halides (SN1/SN2 depending on substrate) and hydrolysis/reduction of esters.

KEY REACTIONS
- Reaction with active metals (Na, K): 2 ROH + 2Na → 2 RONa + H2 — reactivity 1° > 2° > 3° (steric + inductive effects on O-H bond accessibility/acidity).
- Esterification (Fischer): RCOOH + R'OH ⇌ RCOOR' + H2O, acid-catalysed, reversible; 3° alcohols esterify poorly/slowly due to steric hindrance and competing elimination.
- Dehydration (E1, acid-catalysed, conc. H2SO4/H3PO4 or Al2O3): forms alkene via carbocation, follows Zaitsev's rule (more substituted alkene major), rate 3° > 2° > 1° (carbocation stability); 1° alcohols may need POCl3/pyridine (E2-like, no carbocation, no rearrangement) since acid-catalysed E1 is too slow/rearranges.
- Reaction with HX (Lucas test = conc. HCl + anhydrous ZnCl2): 3° alcohols → turbidity immediately (fast SN1, stable carbocation), 2° → turbidity in 5-10 min, 1° → no turbidity at room temp (needs heating, SN2). This is THE standard test to distinguish 1°/2°/3° alcohols.
- SOCl2 (Darzens procedure), PCl5, PCl3/PBr3: convert -OH to -Cl/-Br with clean inversion or retention depending on reagent/mechanism; SOCl2 is preferred for clean 1°/2° alcohol → alkyl chloride conversion (byproducts SO2 + HCl escape as gas, easy purification).
- Oxidation: 1° alcohol → aldehyde (PCC, or Collins reagent — stops at aldehyde) or → carboxylic acid (KMnO4/K2Cr2O7, hot, goes all the way); 2° alcohol → ketone (any of the above); 3° alcohol resists oxidation under normal conditions (no H on the carbinol carbon) but undergoes oxidative C-C cleavage under vigorous/hot acidic KMnO4.
- Victor Meyer test: distinguishes 1°/2°/3° alcohols via a colour sequence (alcohol → alkyl iodide → nitroalkane → treat with HNO2 then KOH) — 1° gives red, 2° gives blue, 3° gives no colour.
- Iodoform test (I2/NaOH): positive for ethanol and any alcohol with a CH3-CH(OH)- group (secondary methyl carbinol), giving yellow CHI3 precipitate; methanol and most other alcohols are negative.
- Williamson ether synthesis: sodium alkoxide (from alcohol + Na) + primary alkyl halide → ether, via SN2; fails/gives elimination with 2°/3° halides.
- Pinacol-Pinacolone rearrangement: a vicinal diol (pinacol) under acid loses water to form a carbocation, then a 1,2-alkyl/aryl/hydride shift gives a ketone (pinacolone) — classic JEE rearrangement question.
- Vicinal diol oxidative cleavage: HIO4 or Pb(OAc)4 cleaves C-C bond between adjacent -OH groups, giving two carbonyl fragments — useful for structure determination.

COMMON JEE TRAPS TO WATCH FOR
- Confusing acid-catalysed dehydration (carbocation, can rearrange, Zaitsev) with POCl3/pyridine dehydration (no rearrangement, useful for 1° alcohols).
- Assuming Lucas test works on 1° alcohols at room temperature (it doesn't — that's exactly why it's diagnostic).
- Mixing up which reducing agent (NaBH4 vs LiAlH4) can reduce esters/acids (only LiAlH4 can).
- Forgetting that phenols are far more acidic than alcohols despite both having -OH (resonance in phenoxide vs none in alkoxide).`;

const SYSTEM_PROMPT = `You are the JEE/NEET Chemistry doubt-solving assistant for Vibrant Academy Kota, built to be as sharp and reliable as a top AIR-1-level mentor — never vague, never hand-wavy, always mechanistically correct.

${CHEMISTRY_KNOWLEDGE}

How to answer:
- Answer the student's specific doubt directly and precisely (typically 3-6 sentences; go longer only if the question genuinely needs a multi-step mechanism spelled out).
- Ground your chemistry in the reference knowledge above — it is correct and exam-accurate. Never contradict it.
- If a lecture/textbook excerpt is provided below and is actually relevant, use it to add "Sir's own framing" or a citation-worthy detail, paraphrased — but the reference knowledge above is the final authority on correctness, not the excerpt. If the excerpt is irrelevant or thin, ignore it and answer from the reference knowledge directly.
- Never fabricate a reaction, reagent, or mechanism that isn't chemically real.
- Keep a warm, encouraging, mentor-like tone — like a favourite teacher, not a textbook — but don't sacrifice precision for friendliness.`;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const message = (body as { message?: unknown })?.message;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const videoChunk = findBestVideoChunk(message, videoChunks);
  const bookChunk = findBestBookChunk(message, bookChunks);

  const contextParts: string[] = [];
  if (videoChunk) {
    contextParts.push(
      `Lecture excerpt (${videoChunk.lecture}, "${videoChunk.topic}"):\n${videoChunk.text}`
    );
  }
  if (bookChunk) {
    contextParts.push(
      `Textbook excerpt (p.${bookChunk.page}, "${bookChunk.section}"):\n${bookChunk.text}`
    );
  }

  const userPrompt = [
    contextParts.length > 0
      ? contextParts.join("\n\n")
      : "(No closely matching lecture/textbook excerpt was found for this question.)",
    "",
    `Student's question: ${message}`,
  ].join("\n");

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.25,
    });

    const content =
      completion.choices[0]?.message?.content?.trim() ||
      "Sorry, I couldn't come up with an answer just now — try rephrasing your question.";

    return NextResponse.json({
      content,
      videoChunkId: videoChunk?.id ?? null,
      bookChunkId: bookChunk?.id ?? null,
    });
  } catch (err) {
    console.error("Groq API error:", err);
    return NextResponse.json(
      { error: "The AI backend is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
