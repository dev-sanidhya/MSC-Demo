// scripts/eval-retrieval.mts
//
// Offline retrieval evaluation. Imports the REAL production retrieval modules
// (lib/retrieval.ts -> lib/bm25.ts) via tsx, so this harness can never drift
// from what the app actually serves. Runs a battery of realistic student
// questions and prints the top book/lecture hits for each.
//
// Judged without spending LLM tokens or depending on the Groq API being up.
// The headline metric for the bug this was built to catch: how many DISTINCT
// book pages the battery surfaces. The old keyword matcher over 27 hand-written
// chunks returned the same 2-3 pages for every question.
//
// Usage: npx tsx scripts/eval-retrieval.mts

import { findTopBookChunks, findTopVideoChunks } from "../lib/retrieval";

const QUESTIONS = [
  "Why does Lucas test give turbidity immediately for tertiary alcohols?",
  "What is Victor Meyer test used for?",
  "How does Williamson ether synthesis work?",
  "Why do tertiary alcohols dehydrate faster than primary alcohols with conc H2SO4?",
  "Explain the mechanism of pinacol pinacolone rearrangement",
  "What's the difference between primary secondary and tertiary alcohols?",
  "Why are alcohols less acidic than water?",
  "How do I name 2-ethylpentan-1-ol using IUPAC rules?",
  "Can Grignard reagent react with formaldehyde to give primary alcohol?",
  "What is the iodoform test and which alcohols give positive result?",
  "Why is phenol more acidic than ethanol?",
  "How do I convert an alcohol into alkyl chloride using thionyl chloride?",
  "How does Grignard reagent react with an ester to give tertiary alcohol?",
  "Why does copper(I) salt make a Grignard reagent do conjugate addition?",
  "What is anti-Markovnikov addition and how does peroxide cause it?",
  "Explain hydroboration oxidation of alkenes to give alcohols",
  "What happens in ozonolysis of an alkene?",
  "How does oxymercuration demercuration form an alcohol?",
  "Why does branching lower the boiling point of alcohols?",
  "What is Zaitsev rule in dehydration of alcohols?",
  "How is a halohydrin formed from an alkene?",
  "What does dilute alkaline KMnO4 (Baeyer's reagent) do to an alkene?",
  "Explain Kolbe electrolytic decarboxylation",
  "What is the Wurtz reaction and why does it fail for tertiary halides?",
  "Why is a carbocation rearrangement (1,2-hydride shift) favoured?",
  "What makes benzene aromatic according to Huckel's rule?",
  "Explain optical isomerism and how to assign R and S configuration",
  "What is tautomerism and keto-enol equilibrium?",
  "Why is the staggered conformation of ethane more stable?",
  "What is hyperconjugation and how does it stabilise alkenes?",
];

const pagesSeen = new Set<number>();
let bookHits = 0;
let videoHits = 0;

for (const q of QUESTIONS) {
  const books = findTopBookChunks(q, 2);
  const videos = findTopVideoChunks(q, 1);
  console.log("=".repeat(78));
  console.log("Q:", q);
  if (books.length === 0) {
    console.log("   BOOK  : (none)");
  } else {
    bookHits += 1;
    for (const doc of books) {
      pagesSeen.add(doc.page);
      const range = doc.pageEnd > doc.page ? `${doc.page}-${doc.pageEnd}` : `${doc.page}`;
      console.log(`   BOOK  : p.${range}  ${doc.section}`);
    }
  }
  if (videos.length === 0) {
    console.log("   VIDEO : (none)");
  } else {
    videoHits += 1;
    for (const doc of videos) {
      console.log(`   VIDEO : ${doc.lecture} @${doc.startSeconds}s  ${doc.topic}`);
    }
  }
}

console.log("=".repeat(78));
console.log("\n=== SUMMARY ===");
console.log(`Questions:                 ${QUESTIONS.length}`);
console.log(`With a book citation:      ${bookHits}/${QUESTIONS.length}`);
console.log(`With a lecture citation:   ${videoHits}/${QUESTIONS.length}`);
console.log(`DISTINCT book pages cited: ${pagesSeen.size}`);
console.log(`Pages: ${[...pagesSeen].sort((a, b) => a - b).join(", ")}`);
