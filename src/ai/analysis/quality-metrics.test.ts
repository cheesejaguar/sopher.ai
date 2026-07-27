import { describe, expect, it } from "vitest";

import {
  COMMON_ADVERBS,
  COORDINATING_CONJUNCTIONS,
  IRREGULAR_PAST_PARTICIPLES,
  LY_ADJECTIVE_EXCEPTIONS,
  SUBORDINATING_CONJUNCTIONS,
  TO_BE_FORMS,
  analyzeAdverbs,
  analyzeDialogueRatio,
  analyzePassiveVoice,
  analyzeQuality,
  analyzeReadability,
  analyzeSentenceVariety,
  countComplexWords,
  countSyllables,
  getQualityRecommendations,
  getSentences,
  getWords,
} from "./quality-metrics";

/**
 * Real ~200-word prose fixture: mixed narrative and dialogue with a few
 * adverbs and passive constructions, mirroring typical chapter prose.
 */
const PROSE_FIXTURE = [
  "The rain had been falling since morning, drumming softly against the tall windows of the old house. Eleanor stood at the sink, watching the garden drown. She had grown up here, and every stone of the path was known to her.",
  '"You can\'t keep avoiding him," Margaret said from the doorway. "He came all this way."',
  '"He came for the house," Eleanor said. "Not for me."',
  "Margaret crossed the kitchen and set the kettle on the stove. The gesture was familiar, almost ritual. When they were girls, their mother had done the same thing whenever trouble entered the house, as though tea could hold back the tide.",
  '"The letter was written before Father died," Margaret said quietly. "The lawyer confirmed it. Whatever he wants, he has a right to be heard."',
  "Eleanor dried her hands slowly and turned to face her sister. Outside, thunder rolled across the valley, and the lights flickered once. She thought of the years she had spent keeping this place alive, the roof she had patched, the debts she had paid.",
  '"Then we hear him," she said finally. "But he doesn\'t stay the night."',
].join("\n\n");

describe("data completeness", () => {
  it("preserves all to-be forms", () => {
    expect(TO_BE_FORMS.size).toBe(8);
    for (const form of ["am", "is", "are", "was", "were", "be", "being", "been"]) {
      expect(TO_BE_FORMS.has(form)).toBe(true);
    }
  });

  it("preserves all 7 coordinating conjunctions", () => {
    expect(COORDINATING_CONJUNCTIONS.size).toBe(7);
    for (const c of ["and", "but", "or", "nor", "for", "yet", "so"]) {
      expect(COORDINATING_CONJUNCTIONS.has(c)).toBe(true);
    }
  });

  it("preserves all 18 subordinating conjunctions", () => {
    expect(SUBORDINATING_CONJUNCTIONS.size).toBe(18);
    for (const c of ["although", "because", "while", "whether", "till"]) {
      expect(SUBORDINATING_CONJUNCTIONS.has(c)).toBe(true);
    }
  });

  it("preserves all 51 irregular past participles", () => {
    expect(IRREGULAR_PAST_PARTICIPLES.size).toBe(51);
    for (const p of ["written", "taken", "understood", "sung", "struck"]) {
      expect(IRREGULAR_PAST_PARTICIPLES.has(p)).toBe(true);
    }
  });

  it("preserves all 74 common adverbs", () => {
    expect(COMMON_ADVERBS.size).toBe(74);
    for (const a of ["suddenly", "very", "just", "then", "unfortunately", "widely"]) {
      expect(COMMON_ADVERBS.has(a)).toBe(true);
    }
  });

  it("preserves all 18 -ly adjective exceptions", () => {
    expect(LY_ADJECTIVE_EXCEPTIONS.size).toBe(18);
    for (const a of ["only", "friendly", "elderly", "chilly"]) {
      expect(LY_ADJECTIVE_EXCEPTIONS.has(a)).toBe(true);
    }
  });
});

describe("countSyllables", () => {
  it("returns 1 for short words", () => {
    expect(countSyllables("a")).toBe(1);
    expect(countSyllables("at")).toBe(1);
    expect(countSyllables("cat")).toBe(1);
  });

  it("strips silent endings before counting vowel groups", () => {
    expect(countSyllables("hopes")).toBe(1); // "es" stripped -> "hop"
    expect(countSyllables("table")).toBe(1); // "e" stripped -> "tabl"
  });

  it("counts vowel groups including y", () => {
    expect(countSyllables("beautiful")).toBe(3); // eau, i, u
    expect(countSyllables("syllable")).toBe(2); // "e" stripped -> y, a
    expect(countSyllables("running")).toBe(2); // u, i
  });

  it("is case-insensitive", () => {
    expect(countSyllables("CAT")).toBe(1);
    expect(countSyllables("Beautiful")).toBe(3);
  });
});

describe("getWords / getSentences", () => {
  it("extracts word tokens", () => {
    expect(getWords("Hello, world! It's me.")).toEqual(["Hello", "world", "It", "s", "me"]);
  });

  it("returns empty for empty text", () => {
    expect(getWords("")).toEqual([]);
    expect(getSentences("")).toEqual([]);
  });

  it("splits sentences on terminal punctuation", () => {
    expect(getSentences("First. Second! Third?")).toEqual(["First", "Second", "Third"]);
  });
});

describe("countComplexWords", () => {
  it("counts 3+ syllable words, skipping capitalized words and common suffixes", () => {
    // "computer" has 3 vowel groups; "cat" has 1; "Beautiful" skipped (capitalized)
    expect(countComplexWords(["computer", "cat", "Beautiful"])).toBe(1);
  });
});

describe("analyzeReadability", () => {
  it("computes clamped scores for simple text", () => {
    const scores = analyzeReadability("The cat sat on the mat.");
    expect(scores.fleschReadingEase).toBe(100); // clamped upper bound
    expect(scores.fleschKincaidGrade).toBe(0); // clamped lower bound
    expect(scores.gunningFogIndex).toBeCloseTo(2.4, 5);
    expect(scores.readingLevel).toBe("elementary");
  });

  it("returns defaults for empty text", () => {
    const scores = analyzeReadability("");
    expect(scores.fleschReadingEase).toBe(0);
    expect(scores.averageGradeLevel).toBe(0);
    expect(scores.readingLevel).toBe("high_school");
  });
});

describe("analyzeSentenceVariety", () => {
  it("classifies sentence types", () => {
    const variety = analyzeSentenceVariety(
      "I ran. Because it rained, we stayed. He laughed and she cried. Why? Stop!",
    );
    expect(variety.totalSentences).toBe(5);
    expect(variety.simpleSentences).toBe(1);
    expect(variety.complexSentences).toBe(1);
    expect(variety.compoundSentences).toBe(1);
    expect(variety.questionSentences).toBe(1);
    expect(variety.exclamationSentences).toBe(1);
  });

  it("computes length statistics and variety score in 0..1", () => {
    const variety = analyzeSentenceVariety("Short one. This sentence is quite a bit longer here.");
    expect(variety.shortestSentence).toBe(2);
    expect(variety.longestSentence).toBe(8);
    expect(variety.averageLength).toBeCloseTo(5, 5);
    expect(variety.varietyScore).toBeGreaterThan(0);
    expect(variety.varietyScore).toBeLessThanOrEqual(1);
  });
});

describe("analyzePassiveVoice", () => {
  it("detects irregular past participle passives", () => {
    const voice = analyzePassiveVoice("The letter was written by John. She wrote the reply.");
    expect(voice.totalSentences).toBe(2);
    expect(voice.passiveSentences).toBe(1);
    expect(voice.passivePercentage).toBeCloseTo(50, 5);
    expect(voice.passiveInstances).toContain("was ... written");
  });

  it("detects passive with intervening -ly adverb", () => {
    const voice = analyzePassiveVoice("The song was beautifully sung.");
    expect(voice.passiveSentences).toBe(1);
    expect(voice.passiveInstances).toContain("was ... sung");
  });

  it("does not flag simple copular sentences", () => {
    const voice = analyzePassiveVoice("The result was good.");
    expect(voice.passiveSentences).toBe(0);
  });
});

describe("analyzeAdverbs", () => {
  it("counts -ly adverbs and excludes -ly adjectives", () => {
    const adverbs = analyzeAdverbs(
      "She quickly ran. Suddenly, the door opened. The friendly dog barked.",
    );
    expect(adverbs.adverbCount).toBe(2);
    expect(adverbs.lyAdverbs).toBe(2);
    expect(adverbs.adverbsFound).toContain("quickly");
    expect(adverbs.adverbsFound).toContain("suddenly");
    expect(adverbs.adverbsFound).not.toContain("friendly");
    expect(adverbs.sentenceStartingAdverbs).toBe(1);
  });

  it("counts non-ly common adverbs", () => {
    const adverbs = analyzeAdverbs("It was very hot and quite dry.");
    expect(adverbs.adverbCount).toBe(2);
    expect(adverbs.lyAdverbs).toBe(0);
  });
});

describe("analyzeDialogueRatio", () => {
  it("handles straight and smart quotes", () => {
    const ratio = analyzeDialogueRatio('"Hello there," she said. “Goodbye now,” he replied.');
    expect(ratio.dialogueExchanges).toBe(2);
    expect(ratio.dialogueWords).toBe(4);
    expect(ratio.totalWords).toBe(8);
    expect(ratio.narrativeWords).toBe(4);
    expect(ratio.dialoguePercentage).toBeCloseTo(50, 5);
    expect(ratio.averageExchangeLength).toBeCloseTo(2, 5);
  });

  it("reports zero dialogue for pure narrative", () => {
    const ratio = analyzeDialogueRatio("The road stretched on for miles.");
    expect(ratio.dialogueWords).toBe(0);
    expect(ratio.dialoguePercentage).toBe(0);
  });
});

describe("analyzeQuality on a ~200-word prose fixture", () => {
  const report = analyzeQuality(PROSE_FIXTURE);

  it("computes plausible basic counts", () => {
    expect(report.wordCount).toBeGreaterThanOrEqual(170);
    expect(report.wordCount).toBeLessThanOrEqual(210);
    expect(report.characterCount).toBe(PROSE_FIXTURE.length);
    expect(report.paragraphCount).toBe(7);
  });

  it("computes plausible readability for conversational prose", () => {
    expect(report.readability.fleschReadingEase).toBeGreaterThanOrEqual(60);
    expect(report.readability.fleschReadingEase).toBeLessThanOrEqual(100);
    expect(report.readability.fleschKincaidGrade).toBeGreaterThanOrEqual(1);
    expect(report.readability.fleschKincaidGrade).toBeLessThanOrEqual(9);
    expect(report.readability.gunningFogIndex).toBeGreaterThanOrEqual(3);
    expect(report.readability.gunningFogIndex).toBeLessThanOrEqual(14);
    expect(["elementary", "middle_school", "high_school"]).toContain(
      report.readability.readingLevel,
    );
  });

  it("computes plausible sentence variety", () => {
    expect(report.sentenceVariety.totalSentences).toBeGreaterThanOrEqual(15);
    expect(report.sentenceVariety.totalSentences).toBeLessThanOrEqual(21);
    expect(report.sentenceVariety.varietyScore).toBeGreaterThan(0.2);
    expect(report.sentenceVariety.varietyScore).toBeLessThanOrEqual(1);
  });

  it("detects the passive constructions", () => {
    expect(report.voiceAnalysis.passiveSentences).toBeGreaterThanOrEqual(2);
    expect(report.voiceAnalysis.passivePercentage).toBeGreaterThanOrEqual(5);
    expect(report.voiceAnalysis.passivePercentage).toBeLessThanOrEqual(25);
  });

  it("tracks the adverbs", () => {
    expect(report.adverbAnalysis.adverbCount).toBeGreaterThanOrEqual(4);
    expect(report.adverbAnalysis.lyAdverbs).toBeGreaterThanOrEqual(4);
    expect(report.adverbAnalysis.adverbPercentage).toBeGreaterThanOrEqual(1);
    expect(report.adverbAnalysis.adverbPercentage).toBeLessThanOrEqual(6);
  });

  it("measures the dialogue ratio", () => {
    expect(report.dialogueRatio.dialogueExchanges).toBe(8);
    expect(report.dialogueRatio.dialoguePercentage).toBeGreaterThanOrEqual(15);
    expect(report.dialogueRatio.dialoguePercentage).toBeLessThanOrEqual(40);
  });

  it("produces an overall score in a plausible range", () => {
    expect(report.overallScore).toBeGreaterThanOrEqual(70);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });
});

describe("analyzeQuality edge cases", () => {
  it("returns a zeroed report for empty text", () => {
    const report = analyzeQuality("");
    expect(report.wordCount).toBe(0);
    expect(report.overallScore).toBe(0);
    expect(report.readability.readingLevel).toBe("high_school");
  });

  it("returns a zeroed report for whitespace-only text", () => {
    const report = analyzeQuality("   \n\n  ");
    expect(report.wordCount).toBe(0);
    expect(report.overallScore).toBe(0);
  });
});

describe("getQualityRecommendations", () => {
  it("flags passive voice, adverb overuse, and sparse dialogue", () => {
    const cluttered =
      "The house was built long ago and it was known widely. " +
      "Truly, sadly, it certainly was quietly forgotten. " +
      "It was seen rarely by anyone.";
    const recs = getQualityRecommendations(analyzeQuality(cluttered));
    expect(recs.some((r) => r.includes("Passive voice is used"))).toBe(true);
    expect(recs.some((r) => r.includes("Adverbs make up"))).toBe(true);
    expect(recs.some((r) => r.includes("Dialogue is sparse"))).toBe(true);
  });

  it("returns no dialogue or passive warnings for balanced prose", () => {
    const recs = getQualityRecommendations(analyzeQuality(PROSE_FIXTURE));
    expect(recs.every((r) => typeof r === "string")).toBe(true);
    expect(recs.some((r) => r.includes("Dialogue is sparse"))).toBe(false);
    expect(recs.some((r) => r.includes("Dialogue is heavy"))).toBe(false);
  });
});
