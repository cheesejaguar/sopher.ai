/**
 * Pacing analysis.
 *
 * Ported from `_port/backend/pacing_analyzer.py`.
 *
 * Provides comprehensive pacing analysis for:
 * - Scene length distribution
 * - Tension curve analysis
 * - Action vs reflection balance
 * - Chapter ending strength
 *
 * These heuristics run on every chapter for free (no LLM): dependency-free,
 * side-effect free, and O(n) over the text.
 */

import { getWords } from "./quality-metrics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tension/intensity levels for scenes.
 * 1 = very low ... 5 = climactic (see {@link TENSION_LEVELS}).
 */
export type TensionLevel = 1 | 2 | 3 | 4 | 5;

export type TensionLevelName = "very_low" | "low" | "medium" | "high" | "climactic";

export const TENSION_LEVELS: Record<TensionLevelName, TensionLevel> = {
  very_low: 1, // Quiet reflection, peaceful moments
  low: 2, // Calm dialogue, setup
  medium: 3, // Normal action, mild conflict
  high: 4, // Confrontation, chase, discovery
  climactic: 5, // Peak tension, major reveals, climax
};

/** Types of scenes for pacing analysis. */
export type SceneType =
  | "action" // Physical movement, fights, chases
  | "dialogue" // Character conversations
  | "reflection" // Internal monologue, thinking
  | "description" // Setting, world-building
  | "transition" // Scene changes, time jumps
  | "mixed"; // Combination of types

/** Strength of chapter/scene endings. */
export type EndingStrength =
  | "weak" // Trailing off, no hook
  | "moderate" // Some closure, mild interest
  | "strong"; // Clear hook or cliffhanger

/** Shape of the tension curve across the text. */
export type CurveType = "flat" | "rising" | "falling" | "arc" | "volatile";

/** Analysis of an individual scene. */
export interface SceneAnalysis {
  wordCount: number;
  sceneType: SceneType;
  tensionLevel: TensionLevel;
  /** 0-1 */
  dialogueRatio: number;
  /** 0-1 */
  actionWordsRatio: number;
  estimatedReadTimeSeconds: number;
}

/** Distribution of scene lengths. */
export interface SceneLengthDistribution {
  totalScenes: number;
  averageLength: number;
  shortestScene: number;
  longestScene: number;
  sceneLengths: number[];
  stdDeviation: number;
  /** 0-1, higher is more varied. */
  varietyScore: number;
}

/** Tension curve analysis. */
export interface TensionCurve {
  /** Tension levels at intervals. */
  tensionPoints: number[];
  averageTension: number;
  peakTension: number;
  /** 0-1 position in text. */
  peakPosition: number;
  tensionVariance: number;
  /** Does tension build over time? */
  hasBuild: boolean;
  /** Is there a clear peak? */
  hasClimax: boolean;
  /** Does tension decrease after peak? */
  hasResolution: boolean;
  curveType: CurveType;
}

/** Balance between action and reflection. */
export interface ActionReflectionBalance {
  totalWords: number;
  actionWords: number;
  dialogueWords: number;
  reflectionWords: number;
  descriptionWords: number;
  actionPercentage: number;
  dialoguePercentage: number;
  reflectionPercentage: number;
  descriptionPercentage: number;
  /** 0-1, higher is better balanced. */
  balanceScore: number;
  recommendation: string;
}

/** Analysis of chapter ending strength. */
export interface ChapterEndingAnalysis {
  /** Last few sentences (limited to 200 chars). */
  endingText: string;
  endingStrength: EndingStrength;
  hasHook: boolean;
  hasCliffhanger: boolean;
  hasQuestion: boolean;
  hasUnresolvedConflict: boolean;
  /** 0-1 */
  hookScore: number;
}

/** Complete pacing analysis report. */
export interface PacingReport {
  wordCount: number;
  estimatedReadTimeMinutes: number;
  sceneDistribution: SceneLengthDistribution;
  tensionCurve: TensionCurve;
  actionBalance: ActionReflectionBalance;
  endingAnalysis: ChapterEndingAnalysis;
  /** 0-100 */
  overallPacingScore: number;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Text analysis utilities
// ---------------------------------------------------------------------------

const DIALOGUE_PATTERN = /["“”]([^"“”]+)["“”]/g;
const SCENE_BREAK_PATTERN = /\n\s*\n|\n\s*[#*]{3,}\s*\n|\n\s*-{3,}\s*\n/;

/** Words indicating action. */
export const ACTION_WORDS: ReadonlySet<string> = new Set([
  "ran",
  "run",
  "running",
  "jumped",
  "jump",
  "jumping",
  "fought",
  "fight",
  "fighting",
  "struck",
  "strike",
  "hitting",
  "hit",
  "punched",
  "kicked",
  "grabbed",
  "grab",
  "threw",
  "throw",
  "shot",
  "shooting",
  "chased",
  "chase",
  "escaped",
  "escape",
  "fled",
  "flee",
  "dodged",
  "dodge",
  "attacked",
  "attack",
  "blocked",
  "block",
  "slammed",
  "slam",
  "crashed",
  "crash",
  "leaped",
  "leap",
  "dashed",
  "dash",
  "sprinted",
  "sprint",
  "lunged",
  "lunge",
  "dove",
  "dive",
  "rolled",
  "roll",
  "swung",
  "swing",
  "shoved",
  "shove",
  "pushed",
  "push",
  "pulled",
  "pull",
  "dragged",
  "drag",
  "hurled",
  "hurl",
  "charged",
  "charge",
  "rushed",
  "rush",
  "raced",
  "race",
  "climbed",
  "climb",
  "fell",
  "fall",
  "tumbled",
  "tumble",
  "exploded",
  "explode",
  "burst",
  "bursting",
]);

/** Words indicating reflection/internal state. */
export const REFLECTION_WORDS: ReadonlySet<string> = new Set([
  "thought",
  "think",
  "thinking",
  "wondered",
  "wonder",
  "pondered",
  "ponder",
  "considered",
  "consider",
  "remembered",
  "remember",
  "recalled",
  "recall",
  "realized",
  "realize",
  "felt",
  "feel",
  "feeling",
  "knew",
  "know",
  "believed",
  "believe",
  "imagined",
  "imagine",
  "dreamed",
  "dream",
  "hoped",
  "hope",
  "feared",
  "fear",
  "worried",
  "worry",
  "doubted",
  "doubt",
  "suspected",
  "suspect",
  "understood",
  "understand",
  "recognized",
  "recognize",
  "contemplated",
  "contemplate",
  "reflected",
  "reflect",
  "mused",
  "muse",
  "brooded",
  "brood",
  "regretted",
  "regret",
  "wished",
  "wish",
  "longed",
  "long",
  "yearned",
  "yearn",
  "decided",
  "decide",
  "concluded",
  "conclude",
]);

/**
 * Words indicating high tension.
 * Note: the source list includes the phrase "heart pounded"; it is preserved for
 * fidelity but can never match the single-word membership test, exactly as in
 * the Python original.
 */
export const TENSION_WORDS: ReadonlySet<string> = new Set([
  "suddenly",
  "immediately",
  "urgent",
  "danger",
  "threat",
  "desperate",
  "panic",
  "terrified",
  "horrified",
  "shocked",
  "stunned",
  "frozen",
  "heart pounded",
  "screamed",
  "shouted",
  "yelled",
  "roared",
  "gasped",
  "trembled",
  "shook",
  "deadly",
  "fatal",
  "critical",
  "crucial",
  "life",
  "death",
  "kill",
  "killed",
  "murder",
  "blood",
  "wound",
  "injured",
  "trapped",
  "escape",
  "chase",
  "pursuit",
  "hunter",
  "hunted",
  "prey",
  "attack",
  "defend",
  "fight",
  "battle",
  "war",
  "enemy",
  "foe",
]);

/** Words indicating calm/low tension. */
export const CALM_WORDS: ReadonlySet<string> = new Set([
  "peaceful",
  "calm",
  "quiet",
  "serene",
  "gentle",
  "soft",
  "slow",
  "relaxed",
  "comfortable",
  "safe",
  "warm",
  "cozy",
  "pleasant",
  "lovely",
  "beautiful",
  "smiled",
  "laughed",
  "enjoyed",
  "appreciated",
  "content",
  "satisfied",
  "happy",
  "joyful",
  "tranquil",
  "still",
]);

/** Count words within dialogue. */
export function getDialogueWordCount(text: string): number {
  let wordCount = 0;
  for (const match of text.matchAll(DIALOGUE_PATTERN)) {
    wordCount += getWords(match[1]).length;
  }
  return wordCount;
}

/** Split text into scenes based on common scene breaks. */
export function splitIntoScenes(text: string): string[] {
  return text
    .split(SCENE_BREAK_PATTERN)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Tension analysis
// ---------------------------------------------------------------------------

/** Calculate tension level for a piece of text. */
export function calculateTensionLevel(text: string): TensionLevel {
  const words = getWords(text.toLowerCase());
  if (words.length === 0) {
    return TENSION_LEVELS.medium;
  }

  // Count tension and calm indicators
  let tensionCount = 0;
  let calmCount = 0;
  let actionCount = 0;
  for (const w of words) {
    if (TENSION_WORDS.has(w)) tensionCount += 1;
    if (CALM_WORDS.has(w)) calmCount += 1;
    if (ACTION_WORDS.has(w)) actionCount += 1;
  }

  const total = words.length;
  const tensionRatio = (tensionCount + actionCount) / total;
  const calmRatio = calmCount / total;

  // Check for specific high-tension patterns
  const hasSudden = words.includes("suddenly") || words.includes("immediately");
  const hasExclamation = text.includes("!");

  // Calculate base level
  if (tensionRatio > 0.05 || hasSudden || hasExclamation) {
    if (tensionRatio > 0.1) {
      return TENSION_LEVELS.climactic;
    }
    return TENSION_LEVELS.high;
  } else if (calmRatio > 0.03) {
    if (calmRatio > 0.06) {
      return TENSION_LEVELS.very_low;
    }
    return TENSION_LEVELS.low;
  }
  return TENSION_LEVELS.medium;
}

function emptyTensionCurve(): TensionCurve {
  return {
    tensionPoints: [],
    averageTension: 0,
    peakTension: 0,
    peakPosition: 0,
    tensionVariance: 0,
    hasBuild: false,
    hasClimax: false,
    hasResolution: false,
    curveType: "flat",
  };
}

/** Analyze tension curve across the text. */
export function analyzeTensionCurve(text: string, intervals = 10): TensionCurve {
  if (!text || !text.trim()) {
    return emptyTensionCurve();
  }

  const words = getWords(text);
  if (words.length === 0) {
    return emptyTensionCurve();
  }

  const totalWords = words.length;
  const intervalSize = Math.max(Math.floor(totalWords / intervals), 50);

  const curve = emptyTensionCurve();

  // Calculate tension at each interval
  for (let i = 0; i < intervals; i++) {
    const start = i * intervalSize;
    const end = Math.min((i + 1) * intervalSize, totalWords);
    if (start >= totalWords) {
      break;
    }

    // Reconstruct text for this interval (approximate)
    const intervalText = words.slice(start, end).join(" ");
    curve.tensionPoints.push(calculateTensionLevel(intervalText));
  }

  if (curve.tensionPoints.length === 0) {
    return emptyTensionCurve();
  }

  // Calculate statistics
  curve.averageTension = mean(curve.tensionPoints);
  curve.peakTension = Math.max(...curve.tensionPoints);

  // Find peak position
  const peakIdx = curve.tensionPoints.indexOf(curve.peakTension);
  curve.peakPosition = peakIdx / curve.tensionPoints.length;

  // Calculate variance
  const avg = curve.averageTension;
  curve.tensionVariance =
    curve.tensionPoints.reduce((acc, x) => acc + (x - avg) ** 2, 0) / curve.tensionPoints.length;

  // Analyze curve characteristics
  const firstHalf = curve.tensionPoints.slice(0, Math.floor(curve.tensionPoints.length / 2));
  const secondHalf = curve.tensionPoints.slice(Math.floor(curve.tensionPoints.length / 2));

  const firstHalfAvg = mean(firstHalf);
  const secondHalfAvg = mean(secondHalf);

  // Check for build
  curve.hasBuild = firstHalfAvg < secondHalfAvg - 0.5;

  // Check for climax (peak in middle-to-end)
  curve.hasClimax = curve.peakPosition > 0.4 && curve.peakTension >= 4;

  // Check for resolution (tension decreases after peak)
  if (peakIdx < curve.tensionPoints.length - 1) {
    const postPeak = curve.tensionPoints.slice(peakIdx + 1);
    if (postPeak.length > 0) {
      curve.hasResolution = mean(postPeak) < curve.peakTension - 0.5;
    }
  }

  // Determine curve type
  if (curve.tensionVariance < 0.3) {
    curve.curveType = "flat";
  } else if (curve.hasBuild && curve.hasClimax && curve.hasResolution) {
    curve.curveType = "arc";
  } else if (firstHalfAvg < secondHalfAvg) {
    curve.curveType = "rising";
  } else if (firstHalfAvg > secondHalfAvg) {
    curve.curveType = "falling";
  } else {
    curve.curveType = "volatile";
  }

  return curve;
}

// ---------------------------------------------------------------------------
// Scene analysis
// ---------------------------------------------------------------------------

function emptySceneAnalysis(): SceneAnalysis {
  return {
    wordCount: 0,
    sceneType: "mixed",
    tensionLevel: TENSION_LEVELS.medium,
    dialogueRatio: 0,
    actionWordsRatio: 0,
    estimatedReadTimeSeconds: 0,
  };
}

/** Analyze an individual scene. */
export function analyzeScene(text: string): SceneAnalysis {
  if (!text || !text.trim()) {
    return emptySceneAnalysis();
  }

  const words = getWords(text.toLowerCase());
  if (words.length === 0) {
    return emptySceneAnalysis();
  }

  const analysis = emptySceneAnalysis();
  analysis.wordCount = words.length;

  // Estimate read time (average 250 words per minute)
  analysis.estimatedReadTimeSeconds = Math.floor((analysis.wordCount / 250) * 60);

  // Calculate dialogue ratio
  const dialogueWords = getDialogueWordCount(text);
  analysis.dialogueRatio = analysis.wordCount > 0 ? dialogueWords / analysis.wordCount : 0;

  // Calculate action words ratio
  let actionCount = 0;
  for (const w of words) {
    if (ACTION_WORDS.has(w)) actionCount += 1;
  }
  analysis.actionWordsRatio = analysis.wordCount > 0 ? actionCount / analysis.wordCount : 0;

  // Determine scene type
  if (analysis.dialogueRatio > 0.4) {
    analysis.sceneType = "dialogue";
  } else if (analysis.actionWordsRatio > 0.02) {
    analysis.sceneType = "action";
  } else {
    // Check for reflection
    let reflectionCount = 0;
    for (const w of words) {
      if (REFLECTION_WORDS.has(w)) reflectionCount += 1;
    }
    const reflectionRatio = reflectionCount / analysis.wordCount;
    analysis.sceneType = reflectionRatio > 0.01 ? "reflection" : "description";
  }

  // Calculate tension level
  analysis.tensionLevel = calculateTensionLevel(text);

  return analysis;
}

function emptySceneLengthDistribution(): SceneLengthDistribution {
  return {
    totalScenes: 0,
    averageLength: 0,
    shortestScene: 0,
    longestScene: 0,
    sceneLengths: [],
    stdDeviation: 0,
    varietyScore: 0,
  };
}

/** Analyze the distribution of scene lengths. */
export function analyzeSceneDistribution(text: string): SceneLengthDistribution {
  if (!text || !text.trim()) {
    return emptySceneLengthDistribution();
  }

  let scenes = splitIntoScenes(text);
  if (scenes.length === 0) {
    // Treat entire text as one scene
    scenes = [text];
  }

  const distribution = emptySceneLengthDistribution();
  distribution.totalScenes = scenes.length;

  for (const scene of scenes) {
    distribution.sceneLengths.push(getWords(scene).length);
  }

  if (distribution.sceneLengths.length > 0) {
    distribution.averageLength = mean(distribution.sceneLengths);
    distribution.shortestScene = Math.min(...distribution.sceneLengths);
    distribution.longestScene = Math.max(...distribution.sceneLengths);

    // Calculate standard deviation
    if (distribution.sceneLengths.length > 1) {
      const avg = distribution.averageLength;
      const variance =
        distribution.sceneLengths.reduce((acc, x) => acc + (x - avg) ** 2, 0) /
        distribution.sceneLengths.length;
      distribution.stdDeviation = Math.sqrt(variance);

      // Calculate variety score
      if (distribution.averageLength > 0) {
        distribution.varietyScore = Math.min(
          1.0,
          distribution.stdDeviation / distribution.averageLength,
        );
      }
    }
  }

  return distribution;
}

// ---------------------------------------------------------------------------
// Action vs reflection balance
// ---------------------------------------------------------------------------

function emptyActionReflectionBalance(): ActionReflectionBalance {
  return {
    totalWords: 0,
    actionWords: 0,
    dialogueWords: 0,
    reflectionWords: 0,
    descriptionWords: 0,
    actionPercentage: 0,
    dialoguePercentage: 0,
    reflectionPercentage: 0,
    descriptionPercentage: 0,
    balanceScore: 0,
    recommendation: "",
  };
}

/** Analyze action vs reflection balance. */
export function analyzeActionBalance(text: string): ActionReflectionBalance {
  if (!text || !text.trim()) {
    return emptyActionReflectionBalance();
  }

  const words = getWords(text.toLowerCase());
  if (words.length === 0) {
    return emptyActionReflectionBalance();
  }

  const balance = emptyActionReflectionBalance();
  balance.totalWords = words.length;

  // Count dialogue words
  balance.dialogueWords = getDialogueWordCount(text);

  // Count action words
  for (const w of words) {
    if (ACTION_WORDS.has(w)) balance.actionWords += 1;
  }

  // Count reflection words
  for (const w of words) {
    if (REFLECTION_WORDS.has(w)) balance.reflectionWords += 1;
  }

  // Estimate description words (remaining)
  const classified = balance.dialogueWords + balance.actionWords + balance.reflectionWords;
  balance.descriptionWords = Math.max(0, balance.totalWords - classified);

  // Calculate percentages
  if (balance.totalWords > 0) {
    balance.actionPercentage = (balance.actionWords / balance.totalWords) * 100;
    balance.dialoguePercentage = (balance.dialogueWords / balance.totalWords) * 100;
    balance.reflectionPercentage = (balance.reflectionWords / balance.totalWords) * 100;
    balance.descriptionPercentage = (balance.descriptionWords / balance.totalWords) * 100;
  }

  // Calculate balance score
  // Good fiction typically has: ~35% dialogue, ~5% action verbs, ~5% reflection, ~55% description
  // But this varies by genre. Score based on having reasonable distribution.
  const idealDialogue = 35;
  const idealAction = 5;
  const idealReflection = 5;

  const dialogueDiff = Math.abs(balance.dialoguePercentage - idealDialogue);
  const actionDiff = Math.abs(balance.actionPercentage - idealAction);
  const reflectionDiff = Math.abs(balance.reflectionPercentage - idealReflection);

  // Lower total difference = higher score
  const totalDiff = dialogueDiff + actionDiff + reflectionDiff;
  balance.balanceScore = Math.max(0, 1 - totalDiff / 100);

  // Generate recommendation
  if (balance.dialoguePercentage < 20) {
    balance.recommendation = "Consider adding more dialogue to break up narrative.";
  } else if (balance.dialoguePercentage > 60) {
    balance.recommendation = "Balance dialogue with more narrative and description.";
  } else if (balance.actionPercentage < 1) {
    balance.recommendation = "Add some action verbs to create more dynamic prose.";
  } else if (balance.reflectionPercentage < 1) {
    balance.recommendation = "Add more character introspection for depth.";
  } else {
    balance.recommendation = "Good balance between action, dialogue, and reflection.";
  }

  return balance;
}

// ---------------------------------------------------------------------------
// Chapter ending strength
// ---------------------------------------------------------------------------

/** Hook indicators. */
const HOOK_PATTERNS: readonly RegExp[] = [
  /\?$/, // Ends with question
  /!$/, // Ends with exclamation
  /\.\.\.$/, // Trailing off
  /\b(but|yet|however|still)\b/i, // Contrast
];

export const CLIFFHANGER_WORDS: ReadonlySet<string> = new Set([
  "suddenly",
  "then",
  "but",
  "however",
  "until",
  "when",
  "before",
  "as",
  "just",
  "that",
  "moment",
]);

export const UNRESOLVED_WORDS: ReadonlySet<string> = new Set([
  "would",
  "could",
  "might",
  "should",
  "if",
  "whether",
  "unless",
  "until",
  "before",
  "waiting",
  "wondered",
  "unclear",
  "unknown",
]);

const SENTENCE_WITH_PUNCT_PATTERN = /[^.!?]*[.!?]+/g;

function emptyChapterEndingAnalysis(): ChapterEndingAnalysis {
  return {
    endingText: "",
    endingStrength: "moderate",
    hasHook: false,
    hasCliffhanger: false,
    hasQuestion: false,
    hasUnresolvedConflict: false,
    hookScore: 0,
  };
}

/** Analyze chapter ending strength. */
export function analyzeEnding(text: string, endingSentences = 3): ChapterEndingAnalysis {
  if (!text || !text.trim()) {
    return emptyChapterEndingAnalysis();
  }

  // Get the raw ending text (last portion) to preserve punctuation
  const allSentences = text.match(SENTENCE_WITH_PUNCT_PATTERN) ?? [];

  let endingText: string;
  if (allSentences.length === 0) {
    // Fallback to last N words
    const plainWords = text.trim().split(/\s+/);
    endingText = plainWords.length > 30 ? plainWords.slice(-30).join(" ") : text;
  } else {
    // Get last few sentences with punctuation
    endingText = allSentences.slice(-endingSentences).join(" ");
  }

  const analysis = emptyChapterEndingAnalysis();
  analysis.endingText = endingText.trim().slice(0, 200); // Limit stored text

  // Check for hook patterns
  let hookCount = 0;
  for (const pattern of HOOK_PATTERNS) {
    if (pattern.test(endingText)) {
      hookCount += 1;
      analysis.hasHook = true;
    }
  }

  // Check for question
  if (endingText.trim().endsWith("?")) {
    analysis.hasQuestion = true;
    hookCount += 1;
  }

  // Check for cliffhanger words
  const words = getWords(endingText.toLowerCase());
  let cliffhangerCount = 0;
  for (const w of words) {
    if (CLIFFHANGER_WORDS.has(w)) cliffhangerCount += 1;
  }
  if (cliffhangerCount >= 2) {
    analysis.hasCliffhanger = true;
    hookCount += 1;
  }

  // Check for unresolved conflict
  let unresolvedCount = 0;
  for (const w of words) {
    if (UNRESOLVED_WORDS.has(w)) unresolvedCount += 1;
  }
  if (unresolvedCount >= 2) {
    analysis.hasUnresolvedConflict = true;
    hookCount += 1;
  }

  // Calculate hook score
  analysis.hookScore = Math.min(1.0, hookCount / 4);

  // Determine ending strength
  if (analysis.hookScore >= 0.6) {
    analysis.endingStrength = "strong";
  } else if (analysis.hookScore >= 0.3) {
    analysis.endingStrength = "moderate";
  } else {
    analysis.endingStrength = "weak";
  }

  return analysis;
}

// ---------------------------------------------------------------------------
// Aggregate analysis
// ---------------------------------------------------------------------------

function emptyPacingReport(): PacingReport {
  return {
    wordCount: 0,
    estimatedReadTimeMinutes: 0,
    sceneDistribution: emptySceneLengthDistribution(),
    tensionCurve: emptyTensionCurve(),
    actionBalance: emptyActionReflectionBalance(),
    endingAnalysis: emptyChapterEndingAnalysis(),
    overallPacingScore: 0,
    recommendations: [],
  };
}

/** Calculate overall pacing score (0-100). */
function calculateOverallScore(report: PacingReport): number {
  let score = 100.0;

  // Scene variety contributes to pacing
  if (report.sceneDistribution.varietyScore < 0.2) {
    score -= 10; // Uniform scene lengths
  }

  // Tension curve quality
  if (report.tensionCurve.curveType === "flat") {
    score -= 15; // No tension variation
  } else if (report.tensionCurve.curveType === "arc") {
    score += 10; // Good narrative arc
  }

  if (!report.tensionCurve.hasClimax && report.wordCount > 2000) {
    score -= 10; // Long text without climax
  }

  // Action balance
  score += report.actionBalance.balanceScore * 20;

  // Ending strength
  if (report.endingAnalysis.endingStrength === "strong") {
    score += 10;
  } else if (report.endingAnalysis.endingStrength === "weak") {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

/** Generate pacing recommendations. */
function generateRecommendations(report: PacingReport): string[] {
  const recommendations: string[] = [];

  // Scene distribution recommendations
  if (report.sceneDistribution.totalScenes <= 1 && report.wordCount > 1000) {
    recommendations.push(
      "Consider breaking the text into distinct scenes with scene breaks " +
        "to vary pacing and give readers natural pause points.",
    );
  }

  if (report.sceneDistribution.varietyScore < 0.2) {
    recommendations.push(
      "Scene lengths are very uniform. Varying scene length can " +
        "create rhythm and control pacing—shorter scenes for action, " +
        "longer for reflection.",
    );
  }

  // Tension curve recommendations
  if (report.tensionCurve.curveType === "flat") {
    recommendations.push(
      "Tension remains relatively constant throughout. Consider adding " +
        "moments of higher and lower tension to create a more engaging rhythm.",
    );
  }

  if (!report.tensionCurve.hasBuild && report.wordCount > 2000) {
    recommendations.push(
      "Tension doesn't build progressively. For longer pieces, " +
        "gradually increasing tension keeps readers engaged.",
    );
  }

  if (!report.tensionCurve.hasResolution && report.tensionCurve.hasClimax) {
    recommendations.push(
      "The text reaches high tension but doesn't resolve it. " +
        "Unless intentional (cliffhanger), consider adding resolution.",
    );
  }

  // Action balance recommendations
  if (report.actionBalance.recommendation) {
    recommendations.push(report.actionBalance.recommendation);
  }

  // Ending recommendations
  if (report.endingAnalysis.endingStrength === "weak") {
    recommendations.push(
      "The ending feels weak. Consider ending with a question, " +
        "unresolved tension, or a hook to keep readers engaged.",
    );
  }

  return recommendations;
}

/** Perform complete pacing analysis. */
export function analyzePacing(text: string): PacingReport {
  if (!text || !text.trim()) {
    return emptyPacingReport();
  }

  const report = emptyPacingReport();

  // Basic metrics
  const words = getWords(text);
  report.wordCount = words.length;
  report.estimatedReadTimeMinutes = Math.max(1, Math.floor(report.wordCount / 250));

  // Run all analyses
  report.sceneDistribution = analyzeSceneDistribution(text);
  report.tensionCurve = analyzeTensionCurve(text);
  report.actionBalance = analyzeActionBalance(text);
  report.endingAnalysis = analyzeEnding(text);

  // Calculate overall pacing score
  report.overallPacingScore = calculateOverallScore(report);

  // Generate recommendations
  report.recommendations = generateRecommendations(report);

  return report;
}
