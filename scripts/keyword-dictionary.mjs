// scripts/keyword-dictionary.mjs
//
// Deterministic, LLM-free keyword dictionary for the "Alcohol" JEE chemistry
// chapter. Each entry maps a canonical retrieval keyword (English/Hinglish -
// what a student would actually type) to a list of patterns to search for in
// the raw ASR transcript text. Because these lectures are spoken in Hindi,
// the ASR output is mostly Devanagari script - named reactions/tests/reagents
// get transliterated into Devanagari (e.g. "Lucas test" -> "लुकास टेस्ट"),
// while chemical formulas are usually spelled out letter-by-latin-letter and
// so survive as Latin-script tokens (e.g. "SN1", "CrO3", "KMnO4"). Patterns
// below were tuned by sampling scripts/../data/raw/*.json output for this
// exact set of 10 lecture videos.
//
// Every `patterns` entry is matched case-insensitively as a plain substring
// against the chunk's raw ASR text (no word-boundary regex, since Devanagari
// text has no consistent word separators for these compound terms).

export const KEYWORD_DICTIONARY = [
  { keyword: "lucas test", label: "Lucas Test", patterns: ["lucas", "लुकास"] },
  { keyword: "victor meyer test", label: "Victor Meyer Test", patterns: ["victor meyer", "विक्टर मेयर", "विक्टर मायर"] },
  { keyword: "grignard reagent", label: "Grignard Reagent", patterns: ["grignard", "ग्रिगनार्ड", "ग्रिनार्ड", "ग्रिग्नार्ड", "ग्रीन्यार्ड"] },
  { keyword: "williamson ether synthesis", label: "Williamson Ether Synthesis", patterns: ["williamson", "विलियमसन", "विलियम्सन"] },
  { keyword: "markovnikov", label: "Markovnikov's Rule", patterns: ["markovnikov", "मार्कोनिकोव", "मार्कोवनिकोव", "मार्कोनीकोव"] },
  { keyword: "anti-markovnikov", label: "Anti-Markovnikov Addition", patterns: ["anti markovnikov", "एंटी मार्कोनिकोव", "एंटी-मार्कोनिकोव"] },
  { keyword: "hydroboration oxidation", label: "Hydroboration-Oxidation", patterns: ["hydroboration", "हाइड्रोबोरेशन"] },
  { keyword: "esterification", label: "Esterification", patterns: ["esterification", "एस्टरीफिकेशन", "एस्टेरिफिकेशन", "एस्टरिफिकेशन"] },
  { keyword: "fischer esterification", label: "Fischer Esterification", patterns: ["fischer", "फिशर"] },
  { keyword: "dehydration of alcohol", label: "Dehydration of Alcohol", patterns: ["dehydration", "डिहाइड्रेशन"] },
  { keyword: "oxidation of alcohol", label: "Oxidation of Alcohol", patterns: ["oxidation", "ऑक्सीडेशन", "ऑक्सीकरण"] },
  { keyword: "pinacol pinacolone rearrangement", label: "Pinacol-Pinacolone Rearrangement", patterns: ["pinacol", "पिनाकोल", "पिनाकॉल"] },
  { keyword: "hydration", label: "Hydration of Alkene", patterns: ["hydration", "हाइड्रेशन"] },
  { keyword: "lialh4", label: "LiAlH4 Reduction", patterns: ["lialh4", "lialh", "एलएएच", "एल आई अल एच"] },
  { keyword: "nabh4", label: "NaBH4 Reduction", patterns: ["nabh4", "nabh", "एनएबीएच"] },
  { keyword: "diol", label: "Diols / Vicinal Diols", patterns: ["diol", "डायोल", "डाइऑल"] },
  { keyword: "vicinal", label: "Vicinal Substitution", patterns: ["vicinal", "विसिनल"] },
  { keyword: "phenol", label: "Phenol", patterns: ["phenol", "फिनॉल", "फेनॉल", "फिनोल"] },
  { keyword: "acidity of alcohols", label: "Acidity of Alcohols", patterns: ["acidity", "एसिडिटी", "अम्लीयता"] },
  { keyword: "hydrogen bonding", label: "Hydrogen Bonding", patterns: ["hydrogen bond", "हाइड्रोजन बॉन्ड"] },
  { keyword: "boiling point trend", label: "Boiling Point Trend", patterns: ["boiling point", "क्वथनांक"] },
  { keyword: "sn1 mechanism", label: "SN1 Mechanism", patterns: ["sn1"] },
  { keyword: "sn2 mechanism", label: "SN2 Mechanism", patterns: ["sn2"] },
  { keyword: "primary alcohol", label: "Primary Alcohol", patterns: ["primary alcohol", "प्राइमरी अल्कोहल", "1° अल्कोहल", "1 डिग्री अल्कोहल"] },
  { keyword: "secondary alcohol", label: "Secondary Alcohol", patterns: ["secondary alcohol", "सेकेंडरी अल्कोहल", "सेकंडरी अल्कोहल", "2° अल्कोहल"] },
  { keyword: "tertiary alcohol", label: "Tertiary Alcohol", patterns: ["tertiary alcohol", "टर्शरी अल्कोहल", "तृतीयक अल्कोहल", "3° अल्कोहल"] },
  { keyword: "carbocation stability", label: "Carbocation Stability", patterns: ["carbocation", "कार्बोकैटायन", "कार्बोकेशन"] },
  { keyword: "rearrangement", label: "Carbocation Rearrangement", patterns: ["rearrangement", "रिएरेंजमेंट", "रिअरेंजमेंट"] },
  { keyword: "wagner meerwein rearrangement", label: "Wagner-Meerwein Rearrangement", patterns: ["wagner meerwein", "वैगनर मीरवाइन", "वेगनर मीरवाइन"] },
  { keyword: "hofmann elimination", label: "Hofmann Elimination", patterns: ["hofmann", "हॉफमैन", "हॉफमन"] },
  { keyword: "aldehyde", label: "Aldehyde", patterns: ["aldehyde", "एल्डिहाइड"] },
  { keyword: "ketone", label: "Ketone", patterns: ["ketone", "कीटोन"] },
  { keyword: "ether", label: "Ether", patterns: ["ether", "ईथर"] },
  { keyword: "nucleophilic substitution", label: "Nucleophilic Substitution", patterns: ["nucleophile", "न्यूक्लियोफाइल", "nucleophilic"] },
  { keyword: "leaving group", label: "Leaving Group", patterns: ["leaving group", "लीविंग ग्रुप"] },
  { keyword: "mechanism", label: "Reaction Mechanism", patterns: ["mechanism", "मैकेनिज्म"] },
  { keyword: "reaction intermediate", label: "Reaction Intermediate", patterns: ["intermediate", "इंटरमीडिएट"] },
  { keyword: "stability", label: "Stability Comparison", patterns: ["stability", "स्टेबिलिटी"] },
  { keyword: "protonation", label: "Protonation", patterns: ["protonation", "प्रोटोनेशन"] },
  { keyword: "reagent", label: "Reagent", patterns: ["reagent", "रिएजेंट", "रीएजेंट"] },
  { keyword: "cro3", label: "CrO3 (Chromium Trioxide)", patterns: ["cro3"] },
  { keyword: "kmno4", label: "KMnO4 (Potassium Permanganate)", patterns: ["kmno4", "kmo4"] },
  { keyword: "k2cr2o7", label: "K2Cr2O7 (Potassium Dichromate)", patterns: ["k2cr2o7", "k2cr27"] },
  { keyword: "h2so4", label: "H2SO4 (Sulphuric Acid)", patterns: ["h2so4"] },
  { keyword: "hcl", label: "HCl (Hydrochloric Acid)", patterns: ["hcl"] },
  { keyword: "pcl5", label: "PCl5", patterns: ["pcl5"] },
  { keyword: "pcl3", label: "PCl3", patterns: ["pcl3"] },
  { keyword: "pbr3", label: "PBr3", patterns: ["pbr3"] },
  { keyword: "koh", label: "KOH (Potassium Hydroxide)", patterns: ["koh"] },
  { keyword: "sodium", label: "Sodium Metal Reaction", patterns: ["sodium", "सोडियम"] },
  { keyword: "sn1 vs sn2", label: "SN1 vs SN2 Comparison", patterns: ["sn1", "sn2"] },
];
