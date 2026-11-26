const AI_STYLE_PHRASES = [
  "it is important to note",
  "in conclusion",
  "moreover",
  "furthermore",
  "delve into",
  "plays a crucial role",
  "in today's world",
  "comprehensive understanding",
];

function removeSharedPromptText(value, prompts) {
  let text = String(value || "").replace(/^\s*\[page\s+\d+\]\s*$/gim, "");
  for (const prompt of prompts) {
    const phrase = String(prompt || "").trim();
    if (phrase.length < 20) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "ig"), " ");
  }
  return text
    .replace(/^\s*(?:question|q)\s*\d{1,3}\s*[).:\-]?\s*/gim, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsOf(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9']+/g) || [];
}

function shingles(words, size = 5) {
  const values = new Set();
  for (let index = 0; index <= words.length - size; index += 1)
    values.add(words.slice(index, index + size).join(" "));
  return values;
}

function compareSubmissions(currentText, peers, sharedPrompts) {
  const current = wordsOf(removeSharedPromptText(currentText, sharedPrompts));
  if (current.length < 80) return [];
  const currentShingles = shingles(current);
  if (currentShingles.size < 25) return [];

  const matches = [];
  for (const peer of peers) {
    const peerText = peer.extractedText || peer.answerText || "";
    const peerWords = wordsOf(removeSharedPromptText(peerText, sharedPrompts));
    if (peerWords.length < 80) continue;
    const peerShingles = shingles(peerWords);
    if (peerShingles.size < 25) continue;
    let overlap = 0;
    for (const shingle of currentShingles)
      if (peerShingles.has(shingle)) overlap += 1;
    const containment = overlap / Math.min(currentShingles.size, peerShingles.size);
    const union = currentShingles.size + peerShingles.size - overlap;
    const jaccard = union ? overlap / union : 0;
    // High overlap across several long 5-word sequences is a review signal,
    // not proof of copying. Requiring both coverage and shared evidence avoids
    // alerts from short common phrases.
    if (overlap >= 18 && containment >= 0.78 && jaccard >= 0.4)
      matches.push({
        studentName: peer.studentName || "Another student",
        similarity: Math.round(containment * 100),
        sharedShingles: overlap,
      });
  }
  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 4);
}

function analyzeWritingPatterns(text, sharedPrompts) {
  const cleanText = removeSharedPromptText(text, sharedPrompts);
  const words = wordsOf(cleanText);
  if (words.length < 100) return null;

  const sentences = cleanText
    .split(/[.!?]+(?:\s|$)/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => wordsOf(sentence).length >= 4);
  if (sentences.length < 6) return null;

  const cues = [];
  const lowerText = cleanText.toLowerCase();
  const phraseCount = AI_STYLE_PHRASES.reduce(
    (count, phrase) => count + (lowerText.match(new RegExp(phrase, "g")) || []).length,
    0,
  );
  if (phraseCount >= 2) cues.push("multiple formulaic transition phrases");

  const starts = sentences.map((sentence) => wordsOf(sentence).slice(0, 2).join(" "));
  const startCounts = new Map();
  for (const start of starts) startCounts.set(start, (startCounts.get(start) || 0) + 1);
  const repeatedStarts = [...startCounts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  if (repeatedStarts >= 3 && repeatedStarts / starts.length >= 0.3)
    cues.push("repeated sentence openings");

  const sentenceLengths = sentences.map((sentence) => wordsOf(sentence).length);
  const mean = sentenceLengths.reduce((sum, length) => sum + length, 0) / sentenceLengths.length;
  const variance = sentenceLengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / sentenceLengths.length;
  const coefficientOfVariation = mean ? Math.sqrt(variance) / mean : 1;
  if (coefficientOfVariation < 0.16) cues.push("unusually uniform sentence lengths");

  const sentenceSet = new Set(sentences.map((sentence) => wordsOf(sentence).join(" ")));
  if (sentenceSet.size < sentences.length) cues.push("repeated sentence content");

  if (cues.length < 2) return null;
  return {
    code: "authenticity_style_pattern",
    severity: "notice",
    message: `Experimental writing-pattern signal: ${cues.join(", ")}. This cannot establish AI authorship or misconduct; review the original work and discuss it with the student if appropriate. Do not use this signal by itself to change marks.`,
  };
}

export function analyzeSubmissionAuthenticity({
  text,
  peers = [],
  sharedPrompts = [],
}) {
  const flags = [];
  const writingPattern = analyzeWritingPatterns(text, sharedPrompts);
  if (writingPattern) flags.push(writingPattern);

  const matches = compareSubmissions(text, peers, sharedPrompts);
  if (matches.length) {
    const evidence = matches
      .map((match) => `${match.studentName} (${match.similarity}% overlap)`)
      .join(", ");
    flags.push({
      code: "authenticity_submission_similarity",
      severity: "notice",
      message: `Experimental similarity signal: substantial matching 5-word sequences were found with ${evidence}. Shared wording can have legitimate explanations; compare the original submissions and do not treat this alone as proof of misconduct or a reason to change marks.`,
      matches,
    });
  }
  return flags;
}
