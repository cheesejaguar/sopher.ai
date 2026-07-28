/**
 * Prose quality metrics.
 *
 * Ported from `_port/backend/quality_metrics.py`.
 *
 * Provides comprehensive text analysis for:
 * - Reading level (Flesch-Kincaid, Flesch Reading Ease, Gunning Fog, etc.)
 * - Sentence variety analysis
 * - Passive voice detection
 * - Adverb usage tracking
 * - Dialogue-to-narrative ratio
 *
 * These heuristics run on every chapter for free (no LLM): dependency-free,
 * side-effect free, and O(n) over the text.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Reading level categories based on grade level. */
export type ReadingLevel =
  | "elementary" // Grades 1-5 (ages 6-11)
  | "middle_school" // Grades 6-8 (ages 11-14)
  | "high_school" // Grades 9-12 (ages 14-18)
  | "college" // College level
  | "graduate"; // Graduate/professional level

/** Collection of readability metrics. */
export interface ReadabilityScores {
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  gunningFogIndex: number;
  smogIndex: number;
  colemanLiauIndex: number;
  automatedReadabilityIndex: number;
  averageGradeLevel: number;
  readingLevel: ReadingLevel;
}

/** Metrics for sentence variety and structure. */
export interface SentenceVariety {
  totalSentences: number;
  averageLength: number;
  lengthStdDev: number;
  shortestSentence: number;
  longestSentence: number;
  sentenceLengths: number[];
  /** 0-1, higher is more varied. */
  varietyScore: number;
  // Sentence type breakdown
  simpleSentences: number;
  compoundSentences: number;
  complexSentences: number;
  questionSentences: number;
  exclamationSentences: number;
}

/** Passive voice detection results. */
export interface VoiceAnalysis {
  totalSentences: number;
  passiveSentences: number;
  passivePercentage: number;
  /** Example instances, limited to 10. */
  passiveInstances: string[];
}

/** Adverb usage tracking results. */
export interface AdverbAnalysis {
  totalWords: number;
  adverbCount: number;
  adverbPercentage: number;
  /** Unique adverbs found, limited to 20. */
  adverbsFound: string[];
  lyAdverbs: number;
  sentenceStartingAdverbs: number;
}

/** Dialogue to narrative ratio analysis. */
export interface DialogueRatio {
  totalWords: number;
  dialogueWords: number;
  narrativeWords: number;
  dialoguePercentage: number;
  dialogueExchanges: number;
  averageExchangeLength: number;
}

/** Complete prose quality analysis report. */
export interface QualityReport {
  wordCount: number;
  characterCount: number;
  paragraphCount: number;
  readability: ReadabilityScores;
  sentenceVariety: SentenceVariety;
  voiceAnalysis: VoiceAnalysis;
  adverbAnalysis: AdverbAnalysis;
  dialogueRatio: DialogueRatio;
  /** 0-100 quality score. */
  overallScore: number;
}

// ---------------------------------------------------------------------------
// Text statistics helpers
// ---------------------------------------------------------------------------

const SENTENCE_SPLIT_PATTERN = /[.!?]+(?:\s|$)/;
const WORD_PATTERN = /\b\w+\b/g;
const SYLLABLE_VOWEL_PATTERN = /[aeiouy]+/g;
const PARAGRAPH_PATTERN = /\n\s*\n/;

/** Common word endings that don't add a syllable. */
const SILENT_ENDINGS = ["es", "ed", "e"] as const;

/** Extract all words from text. */
export function getWords(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

/** Split text into sentences. */
export function getSentences(text: string): string[] {
  // Handle abbreviations and other edge cases
  return text
    .split(SENTENCE_SPLIT_PATTERN)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Count syllables in a word using vowel groups. */
export function countSyllables(word: string): number {
  let w = word.toLowerCase().trim();
  if (w.length <= 2) {
    return 1;
  }

  // Remove common silent endings
  for (const ending of SILENT_ENDINGS) {
    if (w.endsWith(ending) && w.length > ending.length + 1) {
      w = w.slice(0, -ending.length);
      break;
    }
  }

  // Count vowel groups
  const groups = w.match(SYLLABLE_VOWEL_PATTERN);
  return Math.max(1, groups ? groups.length : 0);
}

/** Count words with 3+ syllables (excluding common suffixes). */
export function countComplexWords(words: string[]): number {
  let complexCount = 0;
  for (const word of words) {
    // Skip proper nouns (simple heuristic: starts with capital)
    const first = word.charAt(0);
    if (first !== first.toLowerCase()) {
      continue;
    }
    // Skip common suffixes that don't add complexity
    let baseWord = word.toLowerCase();
    for (const suffix of ["ing", "ed", "es", "ly"]) {
      if (baseWord.endsWith(suffix)) {
        baseWord = baseWord.slice(0, -suffix.length);
        break;
      }
    }
    if (countSyllables(baseWord) >= 3) {
      complexCount += 1;
    }
  }
  return complexCount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Readability
// ---------------------------------------------------------------------------

function emptyReadabilityScores(): ReadabilityScores {
  return {
    fleschReadingEase: 0,
    fleschKincaidGrade: 0,
    gunningFogIndex: 0,
    smogIndex: 0,
    colemanLiauIndex: 0,
    automatedReadabilityIndex: 0,
    averageGradeLevel: 0,
    readingLevel: "high_school",
  };
}

/** Analyze text readability and return scores. */
export function analyzeReadability(text: string): ReadabilityScores {
  const scores = emptyReadabilityScores();
  if (!text || !text.trim()) {
    return scores;
  }

  const words = getWords(text);
  const sentences = getSentences(text);
  if (words.length === 0 || sentences.length === 0) {
    return scores;
  }

  const totalWords = words.length;
  const totalSentences = sentences.length;
  let totalSyllables = 0;
  let totalCharacters = 0;
  for (const w of words) {
    totalSyllables += countSyllables(w);
    totalCharacters += w.length;
  }
  const complexWords = countComplexWords(words);

  // Calculate metrics
  const avgWordsPerSentence = totalWords / totalSentences;
  const avgSyllablesPerWord = totalSyllables / totalWords;

  // Flesch Reading Ease
  // 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  scores.fleschReadingEase = clamp(
    206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord,
    0,
    100,
  );

  // Flesch-Kincaid Grade Level
  // 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  scores.fleschKincaidGrade = Math.max(
    0,
    0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59,
  );

  // Gunning Fog Index
  // 0.4 * ((words/sentences) + 100 * (complex/words))
  const complexRatio = totalWords > 0 ? (complexWords / totalWords) * 100 : 0;
  scores.gunningFogIndex = 0.4 * (avgWordsPerSentence + complexRatio);

  // SMOG Index (requires at least 30 sentences for accuracy)
  // 1.0430 * sqrt(complex_words * (30/sentences)) + 3.1291
  if (totalSentences >= 10) {
    const smogComplex = complexWords * (30 / totalSentences);
    scores.smogIndex = 1.043 * Math.sqrt(smogComplex) + 3.1291;
  } else {
    scores.smogIndex = scores.fleschKincaidGrade; // Fallback
  }

  // Coleman-Liau Index
  // 0.0588 * L - 0.296 * S - 15.8
  // L = average letters per 100 words, S = average sentences per 100 words
  const lValue = (totalCharacters / totalWords) * 100;
  const sValue = (totalSentences / totalWords) * 100;
  scores.colemanLiauIndex = Math.max(0, 0.0588 * lValue - 0.296 * sValue - 15.8);

  // Automated Readability Index
  // 4.71 * (characters/words) + 0.5 * (words/sentences) - 21.43
  const avgCharsPerWord = totalCharacters / totalWords;
  scores.automatedReadabilityIndex = Math.max(
    0,
    4.71 * avgCharsPerWord + 0.5 * avgWordsPerSentence - 21.43,
  );

  // Calculate average grade level
  const gradeScores = [
    scores.fleschKincaidGrade,
    scores.gunningFogIndex,
    scores.smogIndex,
    scores.colemanLiauIndex,
    scores.automatedReadabilityIndex,
  ];
  scores.averageGradeLevel = gradeScores.reduce((a, b) => a + b, 0) / gradeScores.length;

  // Determine reading level category
  const avg = scores.averageGradeLevel;
  if (avg <= 5) {
    scores.readingLevel = "elementary";
  } else if (avg <= 8) {
    scores.readingLevel = "middle_school";
  } else if (avg <= 12) {
    scores.readingLevel = "high_school";
  } else if (avg <= 16) {
    scores.readingLevel = "college";
  } else {
    scores.readingLevel = "graduate";
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Sentence variety
// ---------------------------------------------------------------------------

/** Coordinating conjunctions for compound detection. */
export const COORDINATING_CONJUNCTIONS: ReadonlySet<string> = new Set([
  "and",
  "but",
  "or",
  "nor",
  "for",
  "yet",
  "so",
]);

/** Subordinating conjunctions for complex detection. */
export const SUBORDINATING_CONJUNCTIONS: ReadonlySet<string> = new Set([
  "after",
  "although",
  "as",
  "because",
  "before",
  "if",
  "once",
  "since",
  "than",
  "that",
  "though",
  "till",
  "unless",
  "until",
  "when",
  "where",
  "whether",
  "while",
]);

/** Pattern to split sentences while keeping the punctuation. */
const SENTENCE_WITH_PUNCT_PATTERN = /[^.!?]+[.!?]+/g;

function emptySentenceVariety(): SentenceVariety {
  return {
    totalSentences: 0,
    averageLength: 0,
    lengthStdDev: 0,
    shortestSentence: 0,
    longestSentence: 0,
    sentenceLengths: [],
    varietyScore: 0,
    simpleSentences: 0,
    compoundSentences: 0,
    complexSentences: 0,
    questionSentences: 0,
    exclamationSentences: 0,
  };
}

/** Analyze sentence variety in text. */
export function analyzeSentenceVariety(text: string): SentenceVariety {
  const variety = emptySentenceVariety();
  if (!text || !text.trim()) {
    return variety;
  }

  // Get sentences with punctuation for type classification
  let sentencesWithPunct = text.match(SENTENCE_WITH_PUNCT_PATTERN) ?? [];
  if (sentencesWithPunct.length === 0) {
    // Fallback: text without clear sentence boundaries
    sentencesWithPunct = text.trim() ? [text.trim()] : [];
  }

  const sentences = getSentences(text);
  if (sentences.length === 0) {
    return variety;
  }

  variety.totalSentences = sentences.length;

  // Calculate sentence lengths and classify types
  sentences.forEach((sentence, i) => {
    const words = getWords(sentence);
    variety.sentenceLengths.push(words.length);

    // Get corresponding sentence with punctuation for classification
    const sentenceWithPunct = (
      i < sentencesWithPunct.length ? sentencesWithPunct[i] : sentence
    ).trim();

    // Classify sentence type based on ending punctuation
    if (sentenceWithPunct.endsWith("?")) {
      variety.questionSentences += 1;
    } else if (sentenceWithPunct.endsWith("!")) {
      variety.exclamationSentences += 1;
    } else {
      // Determine if simple, compound, or complex
      const wordsSet = new Set(getWords(sentence.toLowerCase()));

      let hasCoord = false;
      for (const c of COORDINATING_CONJUNCTIONS) {
        if (wordsSet.has(c)) {
          hasCoord = true;
          break;
        }
      }
      let hasSubord = false;
      for (const c of SUBORDINATING_CONJUNCTIONS) {
        if (wordsSet.has(c)) {
          hasSubord = true;
          break;
        }
      }

      if (hasSubord) {
        variety.complexSentences += 1;
      } else if (hasCoord) {
        variety.compoundSentences += 1;
      } else {
        variety.simpleSentences += 1;
      }
    }
  });

  // Calculate statistics
  if (variety.sentenceLengths.length > 0) {
    variety.averageLength =
      variety.sentenceLengths.reduce((a, b) => a + b, 0) / variety.sentenceLengths.length;
    variety.shortestSentence = Math.min(...variety.sentenceLengths);
    variety.longestSentence = Math.max(...variety.sentenceLengths);

    // Calculate standard deviation
    if (variety.sentenceLengths.length > 1) {
      const mean = variety.averageLength;
      const variance =
        variety.sentenceLengths.reduce((acc, x) => acc + (x - mean) ** 2, 0) /
        variety.sentenceLengths.length;
      variety.lengthStdDev = Math.sqrt(variance);
    }

    // Calculate variety score (based on std dev relative to mean)
    // Higher std dev relative to mean = more variety
    if (variety.averageLength > 0) {
      variety.varietyScore = Math.min(1.0, variety.lengthStdDev / variety.averageLength);
    }
  }

  return variety;
}

// ---------------------------------------------------------------------------
// Passive voice
// ---------------------------------------------------------------------------

/** Common forms of "to be". */
export const TO_BE_FORMS: ReadonlySet<string> = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "being",
  "been",
]);

/** Common irregular past participles. */
export const IRREGULAR_PAST_PARTICIPLES: ReadonlySet<string> = new Set([
  "built",
  "bought",
  "brought",
  "caught",
  "done",
  "drunk",
  "eaten",
  "fallen",
  "felt",
  "found",
  "forgotten",
  "frozen",
  "given",
  "gone",
  "grown",
  "held",
  "hidden",
  "hit",
  "hurt",
  "kept",
  "known",
  "left",
  "lost",
  "made",
  "meant",
  "met",
  "paid",
  "put",
  "read",
  "run",
  "said",
  "seen",
  "sent",
  "set",
  "shown",
  "shut",
  "slept",
  "sold",
  "spent",
  "spoken",
  "stood",
  "struck",
  "sung",
  "taken",
  "taught",
  "thought",
  "told",
  "understood",
  "won",
  "worn",
  "written",
]);

/**
 * Pattern for passive voice: form of "to be" + optional adverb + past participle.
 * Matches: "was written", "was quickly written", "is being done".
 */
const PASSIVE_PATTERN = /\b(am|is|are|was|were|be|being|been)\s+(?:\w+ly\s+)?(\w+)\b/gi;

/** Check if a word is likely a past participle. */
function isPastParticiple(word: string): boolean {
  const wordLower = word.toLowerCase();
  // Check regular past participles
  if (wordLower.endsWith("ed") || wordLower.endsWith("en")) {
    return true;
  }
  // Check irregular past participles
  return IRREGULAR_PAST_PARTICIPLES.has(wordLower);
}

function emptyVoiceAnalysis(): VoiceAnalysis {
  return {
    totalSentences: 0,
    passiveSentences: 0,
    passivePercentage: 0,
    passiveInstances: [],
  };
}

/** Analyze text for passive voice usage. */
export function analyzePassiveVoice(text: string): VoiceAnalysis {
  const analysis = emptyVoiceAnalysis();
  if (!text || !text.trim()) {
    return analysis;
  }

  const sentences = getSentences(text);
  if (sentences.length === 0) {
    return analysis;
  }

  analysis.totalSentences = sentences.length;

  const instances: string[] = [];
  for (const sentence of sentences) {
    let sentenceHasPassive = false;
    for (const match of sentence.matchAll(PASSIVE_PATTERN)) {
      const toBeForm = match[1];
      const followingWord = match[2];
      if (isPastParticiple(followingWord)) {
        if (!sentenceHasPassive) {
          analysis.passiveSentences += 1;
          sentenceHasPassive = true;
        }
        instances.push(`${toBeForm} ... ${followingWord}`);
      }
    }
  }
  // Limit examples
  analysis.passiveInstances = instances.slice(0, 10);

  if (analysis.totalSentences > 0) {
    analysis.passivePercentage = (analysis.passiveSentences / analysis.totalSentences) * 100;
  }

  return analysis;
}

// ---------------------------------------------------------------------------
// Adverb tracking
// ---------------------------------------------------------------------------

/** Common adverbs to track (non-exhaustive). */
export const COMMON_ADVERBS: ReadonlySet<string> = new Set([
  "actually",
  "almost",
  "already",
  "also",
  "always",
  "certainly",
  "completely",
  "constantly",
  "definitely",
  "easily",
  "entirely",
  "especially",
  "even",
  "eventually",
  "exactly",
  "extremely",
  "fairly",
  "finally",
  "frequently",
  "generally",
  "greatly",
  "hardly",
  "highly",
  "immediately",
  "indeed",
  "instead",
  "just",
  "largely",
  "lately",
  "likely",
  "literally",
  "maybe",
  "merely",
  "mostly",
  "nearly",
  "never",
  "normally",
  "obviously",
  "often",
  "only",
  "particularly",
  "perhaps",
  "possibly",
  "presumably",
  "probably",
  "quickly",
  "quite",
  "rather",
  "really",
  "recently",
  "relatively",
  "seemingly",
  "simply",
  "slightly",
  "sometimes",
  "somewhat",
  "soon",
  "still",
  "suddenly",
  "surely",
  "then",
  "therefore",
  "thus",
  "together",
  "too",
  "truly",
  "typically",
  "unfortunately",
  "usually",
  "utterly",
  "very",
  "virtually",
  "well",
  "widely",
]);

/** Words ending in -ly that are adjectives, not adverbs (excluded from -ly detection). */
export const LY_ADJECTIVE_EXCEPTIONS: ReadonlySet<string> = new Set([
  "only",
  "early",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "costly",
  "elderly",
  "friendly",
  "likely",
  "lonely",
  "lovely",
  "silly",
  "ugly",
  "holy",
  "jolly",
  "hilly",
  "chilly",
]);

function emptyAdverbAnalysis(): AdverbAnalysis {
  return {
    totalWords: 0,
    adverbCount: 0,
    adverbPercentage: 0,
    adverbsFound: [],
    lyAdverbs: 0,
    sentenceStartingAdverbs: 0,
  };
}

/** Analyze adverb usage in text. */
export function analyzeAdverbs(text: string): AdverbAnalysis {
  const analysis = emptyAdverbAnalysis();
  if (!text || !text.trim()) {
    return analysis;
  }

  const words = getWords(text);
  const sentences = getSentences(text);

  if (words.length === 0) {
    return analysis;
  }

  analysis.totalWords = words.length;

  const found: string[] = [];
  for (const word of words) {
    const wordLower = word.toLowerCase();

    // Check for -ly adverbs (excluding common false positives)
    if (wordLower.endsWith("ly") && wordLower.length > 3) {
      // Exclude words that are adjectives ending in -ly
      if (!LY_ADJECTIVE_EXCEPTIONS.has(wordLower)) {
        analysis.adverbCount += 1;
        analysis.lyAdverbs += 1;
        found.push(wordLower);
      }
    } else if (COMMON_ADVERBS.has(wordLower)) {
      // Check against common adverbs list
      analysis.adverbCount += 1;
      found.push(wordLower);
    }
  }
  // Unique, limited
  analysis.adverbsFound = [...new Set(found)].slice(0, 20);

  // Check for sentence-starting adverbs
  for (const sentence of sentences) {
    const wordsInSentence = getWords(sentence);
    if (wordsInSentence.length > 0) {
      const firstWord = wordsInSentence[0].toLowerCase();
      if (COMMON_ADVERBS.has(firstWord) || (firstWord.endsWith("ly") && firstWord.length > 3)) {
        analysis.sentenceStartingAdverbs += 1;
      }
    }
  }

  if (analysis.totalWords > 0) {
    analysis.adverbPercentage = (analysis.adverbCount / analysis.totalWords) * 100;
  }

  return analysis;
}

// ---------------------------------------------------------------------------
// Dialogue ratio
// ---------------------------------------------------------------------------

// Patterns for dialogue detection
const DOUBLE_QUOTE_PATTERN = /"([^"]*)"/g;
const SMART_QUOTE_PATTERN = /“([^”]*)”/g;

function emptyDialogueRatio(): DialogueRatio {
  return {
    totalWords: 0,
    dialogueWords: 0,
    narrativeWords: 0,
    dialoguePercentage: 0,
    dialogueExchanges: 0,
    averageExchangeLength: 0,
  };
}

/** Analyze dialogue to narrative ratio. */
export function analyzeDialogueRatio(text: string): DialogueRatio {
  const ratio = emptyDialogueRatio();
  if (!text || !text.trim()) {
    return ratio;
  }

  const totalWords = getWords(text).length;
  if (totalWords === 0) {
    return ratio;
  }

  ratio.totalWords = totalWords;

  // Find all dialogue
  const dialogueMatches: string[] = [];
  for (const match of text.matchAll(DOUBLE_QUOTE_PATTERN)) {
    dialogueMatches.push(match[1]);
  }
  for (const match of text.matchAll(SMART_QUOTE_PATTERN)) {
    dialogueMatches.push(match[1]);
  }

  ratio.dialogueExchanges = dialogueMatches.length;

  // Count dialogue words
  let dialogueWordCount = 0;
  for (const match of dialogueMatches) {
    dialogueWordCount += getWords(match).length;
  }

  ratio.dialogueWords = dialogueWordCount;
  ratio.narrativeWords = totalWords - dialogueWordCount;

  if (totalWords > 0) {
    ratio.dialoguePercentage = (dialogueWordCount / totalWords) * 100;
  }

  if (ratio.dialogueExchanges > 0) {
    ratio.averageExchangeLength = dialogueWordCount / ratio.dialogueExchanges;
  }

  return ratio;
}

// ---------------------------------------------------------------------------
// Aggregate analysis
// ---------------------------------------------------------------------------

function emptyQualityReport(): QualityReport {
  return {
    wordCount: 0,
    characterCount: 0,
    paragraphCount: 0,
    readability: emptyReadabilityScores(),
    sentenceVariety: emptySentenceVariety(),
    voiceAnalysis: emptyVoiceAnalysis(),
    adverbAnalysis: emptyAdverbAnalysis(),
    dialogueRatio: emptyDialogueRatio(),
    overallScore: 0,
  };
}

/** Calculate overall quality score (0-100). */
function calculateOverallScore(report: QualityReport): number {
  let score = 100.0;

  // Readability penalty (target: Flesch Reading Ease 60-80)
  const fre = report.readability.fleschReadingEase;
  if (fre < 30 || fre > 90) {
    score -= 10;
  } else if (fre < 50 || fre > 85) {
    score -= 5;
  }

  // Sentence variety bonus/penalty
  const variety = report.sentenceVariety.varietyScore;
  if (variety > 0.4) {
    score += 5;
  } else if (variety < 0.2) {
    score -= 10;
  }

  // Passive voice penalty (target: < 10%)
  const passive = report.voiceAnalysis.passivePercentage;
  if (passive > 20) {
    score -= 15;
  } else if (passive > 10) {
    score -= 5;
  }

  // Adverb penalty (target: < 2%)
  const adverb = report.adverbAnalysis.adverbPercentage;
  if (adverb > 4) {
    score -= 15;
  } else if (adverb > 2) {
    score -= 5;
  }

  // Dialogue ratio consideration (fiction typically 30-50%)
  const dialogue = report.dialogueRatio.dialoguePercentage;
  if (dialogue < 10 || dialogue > 70) {
    score -= 5;
  }

  return clamp(score, 0, 100);
}

/** Perform complete prose quality analysis. */
export function analyzeQuality(text: string): QualityReport {
  const report = emptyQualityReport();
  if (!text || !text.trim()) {
    return report;
  }

  // Basic counts
  const words = getWords(text);
  report.wordCount = words.length;
  report.characterCount = text.length;
  report.paragraphCount = text.split(PARAGRAPH_PATTERN).filter((p) => p.trim()).length;

  // Run all analyzers
  report.readability = analyzeReadability(text);
  report.sentenceVariety = analyzeSentenceVariety(text);
  report.voiceAnalysis = analyzePassiveVoice(text);
  report.adverbAnalysis = analyzeAdverbs(text);
  report.dialogueRatio = analyzeDialogueRatio(text);

  // Calculate overall quality score
  report.overallScore = calculateOverallScore(report);

  return report;
}

/** Generate recommendations based on analysis. */
export function getQualityRecommendations(report: QualityReport): string[] {
  const recommendations: string[] = [];

  // Readability recommendations
  const fre = report.readability.fleschReadingEase;
  if (fre < 50) {
    recommendations.push(
      "Consider simplifying sentence structure. The text is quite difficult to read. " +
        "Try using shorter sentences and more common words.",
    );
  } else if (fre > 80) {
    recommendations.push(
      "The text may be too simple for adult fiction. " +
        "Consider adding more complexity and varied vocabulary.",
    );
  }

  // Sentence variety
  if (report.sentenceVariety.varietyScore < 0.2) {
    recommendations.push(
      "Sentence lengths are very uniform. " +
        "Try varying sentence length more to create rhythm and interest.",
    );
  }

  // Passive voice
  if (report.voiceAnalysis.passivePercentage > 15) {
    recommendations.push(
      `Passive voice is used in ${report.voiceAnalysis.passivePercentage.toFixed(1)}% of sentences. ` +
        "Consider converting some passive constructions to active voice.",
    );
  }

  // Adverbs
  if (report.adverbAnalysis.adverbPercentage > 3) {
    recommendations.push(
      `Adverbs make up ${report.adverbAnalysis.adverbPercentage.toFixed(1)}% of words. ` +
        "Consider replacing adverbs with stronger verbs.",
    );
  }

  if (report.adverbAnalysis.sentenceStartingAdverbs > 3) {
    recommendations.push(
      `Found ${report.adverbAnalysis.sentenceStartingAdverbs} sentences starting with adverbs. ` +
        "Vary sentence openers for better flow.",
    );
  }

  // Dialogue
  const dialoguePct = report.dialogueRatio.dialoguePercentage;
  if (dialoguePct < 15) {
    recommendations.push(
      "Dialogue is sparse (under 15%). Consider adding more character conversations " +
        "to break up narrative and reveal character.",
    );
  } else if (dialoguePct > 60) {
    recommendations.push(
      "Dialogue is heavy (over 60%). Balance with more narrative, description, " +
        "and introspection.",
    );
  }

  return recommendations;
}
