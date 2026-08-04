import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { z } from "zod";

import {
  chapterSummarySchema,
  chapterSummaryWireSchema,
  conceptSchema,
  conceptWireSchema,
  creativeQuestionSchema,
  critiqueSchema,
  critiqueWireSchema,
  editSuggestionListSchema,
  editSuggestionListWireSchema,
  moderationVerdictSchema,
  normalizeChapterSummary,
  normalizeConcept,
  normalizeCreativeQuestion,
  normalizeCritique,
  normalizeEditSuggestionList,
  normalizeModerationVerdict,
  normalizeReviewPhaseResult,
  normalizeRevision,
  reviewPhaseResultSchema,
  reviewPhaseResultWireSchema,
  revisionSchema,
  revisionWireSchema,
  type ReviewPhaseResult,
} from "@/ai/schemas";
import {
  clampNumber,
  coerceInt,
  coerceIntArray,
  coerceNumber,
  coerceStringArray,
  oneOfOr,
  rescaleUnitScore,
  truncateArray,
  truncateString,
} from "./normalize";

const issue = (over: Record<string, unknown> = {}) => ({
  chapters: [3],
  category: "character",
  severity: "major",
  description: "Mira's eye color changes between chapters",
  suggestedFix: "Pick storm-gray and keep it",
  ...over,
});

const reviewPhase = (over: Record<string, unknown> = {}) => ({
  score: 0.82,
  summary: "The spine holds; a few threads drift.",
  strengths: ["Clear escalation"],
  issues: [issue()],
  ...over,
});

/**
 * The eight answers a competent model actually gives once Anthropic has
 * stripped the caps out of the schema. Seven of these were rejected outright
 * by the strict schema on 2026-08-04 and retried identically four times.
 */
const PROVEN_MODEL_ANSWERS: {
  name: string;
  answer: unknown;
  check: (result: ReviewPhaseResult) => void;
}[] = [
  {
    name: "11 issues when the invisible cap is 10",
    answer: reviewPhase({
      issues: Array.from({ length: 11 }, (_, index) =>
        issue({ description: `Issue ${index + 1}` }),
      ),
    }),
    check: (result) => {
      expect(result.issues).toHaveLength(10);
      expect(result.issues[0].description).toBe("Issue 1");
    },
  },
  {
    name: "7 strengths when the invisible cap is 6",
    answer: reviewPhase({
      strengths: Array.from({ length: 7 }, (_, index) => `Strength ${index + 1}`),
    }),
    check: (result) => expect(result.strengths).toHaveLength(6),
  },
  {
    name: "a 0-100 score instead of 0-1",
    answer: reviewPhase({ score: 85 }),
    check: (result) => expect(result.score).toBeCloseTo(0.85, 10),
  },
  {
    name: "11 chapters on one issue when the invisible cap is 10",
    answer: reviewPhase({
      issues: [issue({ chapters: Array.from({ length: 11 }, (_, index) => index + 1) })],
    }),
    check: (result) => {
      expect(result.issues[0].chapters).toHaveLength(10);
      expect(result.issues[0].chapters[0]).toBe(1);
    },
  },
  {
    name: 'severity "high", which is not one of the three the model never saw',
    answer: reviewPhase({ issues: [issue({ severity: "high" })] }),
    check: (result) => expect(result.issues[0].severity).toBe("minor"),
  },
  {
    name: 'category "pacing", a reasonable word outside the enum',
    answer: reviewPhase({ issues: [issue({ category: "pacing" })] }),
    check: (result) => expect(result.issues[0].category).toBe("plot"),
  },
  {
    name: "chapter numbers as strings",
    answer: reviewPhase({ issues: [issue({ chapters: ["3", "4"] })] }),
    check: (result) => expect(result.issues[0].chapters).toEqual([3, 4]),
  },
  {
    name: "the one answer that already validated",
    answer: reviewPhase(),
    check: (result) => {
      expect(result.score).toBeCloseTo(0.82, 10);
      expect(result.issues[0].severity).toBe("major");
    },
  },
];

describe("the 2026-08-04 continuity failure", () => {
  it.each(PROVEN_MODEL_ANSWERS.slice(0, 7))(
    "salvages an answer the strict schema rejected: $name",
    ({ answer, check }) => {
      // What actually happened: NoObjectGeneratedError on a finished book.
      expect(reviewPhaseResultSchema.safeParse(answer).success).toBe(false);
      // What the permissive wire schema does with the same answer.
      expect(reviewPhaseResultWireSchema.safeParse(answer).success).toBe(true);
      const normalized = normalizeReviewPhaseResult(answer);
      expect(reviewPhaseResultSchema.safeParse(normalized).success).toBe(true);
      check(normalized);
    },
  );

  it.each(PROVEN_MODEL_ANSWERS)(
    "normalizes without loss of meaning: $name",
    ({ answer, check }) => {
      check(normalizeReviewPhaseResult(answer));
    },
  );
});

describe("normalizeReviewPhaseResult", () => {
  it("drops issues with no description instead of inventing one", () => {
    const result = normalizeReviewPhaseResult(
      reviewPhase({ issues: [issue({ description: "   " }), issue(), issue({ description: 7 })] }),
    );
    expect(result.issues).toHaveLength(1);
  });

  it("keeps ten usable issues when the answer also carried empty ones", () => {
    const result = normalizeReviewPhaseResult(
      reviewPhase({
        issues: [
          ...Array.from({ length: 3 }, () => issue({ description: "" })),
          ...Array.from({ length: 12 }, (_, index) => issue({ description: `Real ${index + 1}` })),
        ],
      }),
    );
    expect(result.issues).toHaveLength(10);
    expect(result.issues[0].description).toBe("Real 1");
  });

  it("falls back to an unscored 0.5 rather than failing the phase", () => {
    expect(normalizeReviewPhaseResult(reviewPhase({ score: "excellent" })).score).toBe(0.5);
    expect(normalizeReviewPhaseResult(reviewPhase({ score: null })).score).toBe(0.5);
  });

  it("returns a valid, empty review for an answer with nothing in it", () => {
    const result = normalizeReviewPhaseResult({});
    expect(reviewPhaseResultSchema.safeParse(result).success).toBe(true);
    expect(result).toEqual({ score: 0.5, summary: "", strengths: [], issues: [] });
  });
});

describe("normalizeChapterSummary", () => {
  it("truncates the summary past the cap the model never saw", () => {
    const result = normalizeChapterSummary({ summary: "x".repeat(3_000) });
    expect(result.summary).toHaveLength(2_000);
    expect(chapterSummarySchema.safeParse(result).success).toBe(true);
  });

  it("maps an off-enum entity kind onto character and caps the deltas", () => {
    const answer = {
      summary: "Chapter 4",
      newFacts: Array.from({ length: 20 }, (_, index) => ({
        kind: "protagonist",
        name: `Person ${index + 1}`,
        facts: Array.from({ length: 12 }, (_, fact) => `fact ${fact}`),
      })),
    };
    expect(chapterSummaryWireSchema.safeParse(answer).success).toBe(true);
    const result = normalizeChapterSummary(answer);
    expect(result.newFacts).toHaveLength(16);
    expect(result.newFacts[0].kind).toBe("character");
    expect(result.newFacts[0].facts).toHaveLength(8);
  });

  it("drops unnamed entities and half-formed relationships", () => {
    const result = normalizeChapterSummary({
      summary: "s",
      newFacts: [
        { name: "  ", facts: ["a"] },
        { name: "Mira", facts: [] },
      ],
      relationships: [
        { from: "Mira", to: "Tam", type: "sister" },
        { from: "Mira", type: "owes" },
      ],
    });
    expect(result.newFacts.map((fact) => fact.name)).toEqual(["Mira"]);
    expect(result.relationships).toHaveLength(1);
  });

  /**
   * The outline writes a summary for every chapter before it is drafted, so
   * "the model said nothing" has to stay distinguishable from "the summary is
   * empty" — otherwise the persist step writes the blank over the outline's.
   */
  it("reports a missing summary as null instead of an empty one", () => {
    expect(
      normalizeChapterSummary({ newFacts: [{ name: "Mira", facts: ["a"] }] }).summary,
    ).toBeNull();
    expect(normalizeChapterSummary({ summary: "   " }).summary).toBeNull();
    expect(normalizeChapterSummary({ summary: null }).summary).toBeNull();
    expect(normalizeChapterSummary({ summary: 7 }).summary).toBeNull();
    expect(normalizeChapterSummary({ summary: "Mira reaches the harbor." }).summary).toBe(
      "Mira reaches the harbor.",
    );
  });

  it("keeps the entity deltas of an answer that carried no summary", () => {
    const result = normalizeChapterSummary({
      newFacts: [{ kind: "character", name: "Mira", facts: ["Keeps the ledger"] }],
      relationships: [{ from: "Mira", to: "Kel", type: "sister_of" }],
    });
    expect(result.summary).toBeNull();
    expect(result.newFacts).toHaveLength(1);
    expect(result.relationships).toHaveLength(1);
    expect(chapterSummarySchema.safeParse(result).success).toBe(true);
  });

  it("reads a stringified moderation flag and an off-enum category", () => {
    const result = normalizeModerationVerdict({ flagged: "true", category: "gore", reason: "r" });
    expect(result).toEqual({ flagged: true, category: "other", reason: "r" });
    expect(moderationVerdictSchema.safeParse(result).success).toBe(true);
  });
});

describe("normalizeCritique", () => {
  it("defers an unreadable verdict to the issue list rather than to a retry", () => {
    const answer = { verdict: "needs work", score: 92, issues: [] };
    expect(critiqueSchema.safeParse(answer).success).toBe(false);
    expect(critiqueWireSchema.safeParse(answer).success).toBe(true);
    const result = normalizeCritique(answer);
    expect(result.verdict).toBe("revise");
    expect(result.score).toBeCloseTo(0.92, 10);
  });

  it("caps issues at eight and drops the ones that name no problem", () => {
    const result = normalizeCritique({
      verdict: "revise",
      score: 0.4,
      issues: [
        { spanQuote: "q", problem: "", fix: "f", severity: "major" },
        ...Array.from({ length: 10 }, () => ({ problem: "flat beat", severity: "MAJOR" })),
      ],
    });
    expect(result.issues).toHaveLength(8);
    expect(result.issues[0].severity).toBe("major");
    expect(result.issues[0].spanQuote).toBe("");
  });
});

describe("normalizeRevision", () => {
  it("never turns a missing revision into a silent deletion", () => {
    const answer = {
      replacements: [
        { original: "the old line" },
        { original: "another line", revised: "" },
        { original: "  ", revised: "orphan" },
        { original: "a third line", revised: "a better line" },
      ],
    };
    expect(revisionWireSchema.safeParse(answer).success).toBe(true);
    const result = normalizeRevision(answer);
    expect(result.replacements).toEqual([
      { original: "another line", revised: "" },
      { original: "a third line", revised: "a better line" },
    ]);
  });

  it("caps replacements at twelve", () => {
    const result = normalizeRevision({
      replacements: Array.from({ length: 15 }, (_, index) => ({
        original: `line ${index}`,
        revised: `better ${index}`,
      })),
    });
    expect(result.replacements).toHaveLength(12);
    expect(revisionSchema.safeParse(result).success).toBe(true);
  });
});

describe("normalizeEditSuggestionList", () => {
  it("drops anchors too short to find and maps off-enum labels", () => {
    const answer = {
      suggestions: [
        { anchorText: "too shrt", replacement: "x", rationale: "r", category: "v", severity: "s" },
        {
          anchorText: "short",
          replacement: "x",
          rationale: "r",
          category: "line",
          severity: "info",
        },
        {
          anchorText: "She walked to the window.",
          replacement: "She crossed to the window.",
          rationale: "Weak verb",
          category: "voice",
          severity: "critical",
        },
      ],
    };
    expect(editSuggestionListSchema.safeParse(answer).success).toBe(false);
    expect(editSuggestionListWireSchema.safeParse(answer).success).toBe(true);
    const result = normalizeEditSuggestionList(answer);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[1].category).toBe("line");
    expect(result.suggestions[1].severity).toBe("info");
  });

  it("caps suggestions at twenty", () => {
    const result = normalizeEditSuggestionList({
      suggestions: Array.from({ length: 25 }, () => ({
        anchorText: "She walked to the window.",
        replacement: "She crossed to the window.",
        rationale: "Weak verb",
        category: "line",
        severity: "info",
      })),
    });
    expect(result.suggestions).toHaveLength(20);
  });
});

describe("normalizeConcept", () => {
  const conceptAnswer = (over: Record<string, unknown> = {}) => ({
    title: "The Salt Road",
    logline: "A courier crosses a dying sea.",
    synopsis: "…",
    themes: Array.from({ length: 9 }, (_, index) => `theme ${index}`),
    setting: "A drained ocean basin",
    centralConflict: "Water against memory",
    uniqueElements: Array.from({ length: 8 }, (_, index) => `element ${index}`),
    characters: [{ role: "protagonist" }, { name: "Iyen", role: "courier" }],
    ...over,
  });

  it("caps the lists and drops nameless characters", () => {
    const answer = conceptAnswer();
    expect(conceptSchema.safeParse(answer).success).toBe(false);
    expect(conceptWireSchema.safeParse(answer).success).toBe(true);
    const result = normalizeConcept(answer);
    expect(result?.themes).toHaveLength(6);
    expect(result?.uniqueElements).toHaveLength(5);
    expect(result?.characters).toEqual([
      { name: "Iyen", role: "courier", description: "", arc: "" },
    ]);
    expect(result?.moderation).toEqual({ flagged: false });
  });

  /**
   * The concept the author paid for is on a checkpoint by the time the refine
   * pass answers. A normalizer that turned a half-answer into a well-formed
   * concept with nothing in it would let that half-answer replace it.
   */
  it("returns null rather than a concept whose load-bearing prose is blank", () => {
    for (const field of ["title", "logline", "synopsis", "setting", "centralConflict"]) {
      expect(normalizeConcept(conceptAnswer({ [field]: "   " }))).toBeNull();
      expect(normalizeConcept(conceptAnswer({ [field]: null }))).toBeNull();
      expect(normalizeConcept(conceptAnswer({ [field]: 7 }))).toBeNull();
    }
    expect(normalizeConcept({})).toBeNull();
    expect(normalizeConcept(conceptAnswer())).not.toBeNull();
  });

  it("keeps the wire schema strict about presence, since bounds do not survive", () => {
    // Bounds are stripped from the schema the model is shown; required keys are
    // not, so an omitted logline is the one failure the provider still catches.
    for (const field of ["title", "logline", "synopsis", "setting", "centralConflict"]) {
      const partial = conceptAnswer();
      delete (partial as Record<string, unknown>)[field];
      expect(conceptWireSchema.safeParse(partial).success).toBe(false);
    }
    // Lists stay salvageable entry by entry, so they stay optional.
    const withoutLists = conceptAnswer();
    delete (withoutLists as Record<string, unknown>).themes;
    delete (withoutLists as Record<string, unknown>).characters;
    expect(conceptWireSchema.safeParse(withoutLists).success).toBe(true);
  });
});

describe("normalizeCreativeQuestion", () => {
  const option = (label: string, description: string, id?: string) => ({ id, label, description });

  it("repairs duplicate ids without moving the recommendation", () => {
    const result = normalizeCreativeQuestion({
      question: "Whose voice carries the middle act?",
      rationale: "The midpoint turn reads differently from each side.",
      options: [
        option("Stay with Iyen", "Hold the courier's close third throughout.", "option-1"),
        option("Switch to Tam", "Hand the middle act to the harbourmaster.", "option-1"),
        option("Alternate", "Trade viewpoints chapter by chapter.", "option-3"),
      ],
      recommendedOptionId: "option-3",
    });
    expect(result).not.toBeNull();
    expect(result?.options.map((entry) => entry.id)).toEqual(["option-1", "option-2", "option-3"]);
    expect(result?.recommendedOptionId).toBe("option-3");
    expect(result?.options[2].label).toBe("Alternate");
  });

  it("keeps the recommendation pointing at the option the model chose", () => {
    const result = normalizeCreativeQuestion({
      question: "Whose voice carries the middle act?",
      rationale: "The midpoint turn reads differently from each side.",
      options: [
        option("Stay with Iyen", "Hold the courier's close third throughout.", "b"),
        option("Switch to Tam", "Hand the middle act to the harbourmaster.", "a"),
        option("Alternate", "Trade viewpoints chapter by chapter.", "c"),
      ],
      recommendedOptionId: "a",
    });
    expect(result?.recommendedOptionId).toBe("option-2");
    expect(result?.options[1].label).toBe("Switch to Tam");
  });

  it("supplies a neutral rationale but never invents the question itself", () => {
    const withoutRationale = normalizeCreativeQuestion({
      question: "Whose voice carries the middle act?",
      options: [
        option("Stay with Iyen", "Hold the courier's close third throughout."),
        option("Switch to Tam", "Hand the middle act to the harbourmaster."),
        option("Alternate", "Trade viewpoints chapter by chapter."),
      ],
    });
    expect(withoutRationale?.rationale.length).toBeGreaterThanOrEqual(8);
    expect(withoutRationale?.recommendedOptionId).toBe("option-1");

    expect(
      normalizeCreativeQuestion({
        question: "?",
        options: [
          option("Stay with Iyen", "Hold the courier's close third throughout."),
          option("Switch to Tam", "Hand the middle act to the harbourmaster."),
          option("Alternate", "Trade viewpoints chapter by chapter."),
        ],
      }),
    ).toBeNull();
  });

  it("returns null when there are not three usable options to choose between", () => {
    expect(
      normalizeCreativeQuestion({
        question: "Whose voice carries the middle act?",
        rationale: "The midpoint turn reads differently from each side.",
        options: [
          option("Stay with Iyen", "Hold the courier's close third throughout."),
          option("Switch to Tam", "too short".slice(0, 5)),
        ],
      }),
    ).toBeNull();
  });
});

describe("salvage helpers", () => {
  it("rescales a 0-100 score and leaves a unit score alone", () => {
    expect(rescaleUnitScore(85)).toBeCloseTo(0.85, 10);
    expect(rescaleUnitScore(0.85)).toBeCloseTo(0.85, 10);
    expect(rescaleUnitScore(1)).toBe(1);
    expect(rescaleUnitScore(150)).toBe(1);
    expect(rescaleUnitScore(-3)).toBe(0);
  });

  it("reads the 1-10 band as a ten-point scale, not a percentage", () => {
    // A model that ignores the stated 0-1 range most often answers out of ten.
    // Reading 8 as a percentage would call a good manuscript 0.08, and this
    // number is persisted as the chapter quality score and shown to the author.
    expect(rescaleUnitScore(8)).toBeCloseTo(0.8, 10);
    expect(rescaleUnitScore(10)).toBe(1);
    expect(rescaleUnitScore(7.5)).toBeCloseTo(0.75, 10);
    expect(rescaleUnitScore(2)).toBeCloseTo(0.2, 10);
    // Above ten there is no ambiguity left: it is a percentage.
    expect(rescaleUnitScore(11)).toBeCloseTo(0.11, 10);
    expect(rescaleUnitScore(100)).toBe(1);
    expect(rescaleUnitScore(Number.NaN)).toBe(0);
    expect(rescaleUnitScore(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("clamps non-finite numbers to the least alarming end", () => {
    expect(clampNumber(Number.NaN, 0, 1)).toBe(0);
    expect(clampNumber(4, 0, 1)).toBe(1);
    expect(clampNumber(0.3, 0, 1)).toBe(0.3);
  });

  it("reads numbers out of strings but not out of nonsense", () => {
    expect(coerceNumber("0.82")).toBe(0.82);
    expect(coerceNumber("")).toBeNull();
    expect(coerceNumber(true)).toBeNull();
    expect(coerceNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(coerceInt("3")).toBe(3);
    expect(coerceInt(2.6)).toBe(3);
    expect(coerceInt("three")).toBeNull();
    expect(coerceInt(1e300)).toBeNull();
    expect(coerceIntArray(["3", 4, "x", null])).toEqual([3, 4]);
    expect(coerceIntArray("not a list")).toEqual([]);
  });

  it("matches enum values case-insensitively but never guesses synonyms", () => {
    const severities = ["critical", "major", "minor"] as const;
    expect(oneOfOr(" Major ", severities, "minor")).toBe("major");
    expect(oneOfOr("high", severities, "minor")).toBe("minor");
    expect(oneOfOr(7, severities, "minor")).toBe("minor");
  });

  it("truncates lists, text and blanks", () => {
    expect(truncateArray([1, 2, 3], 2)).toEqual([1, 2]);
    expect(truncateArray([1], 5)).toEqual([1]);
    expect(truncateString("abc def", 4)).toBe("abc");
    expect(truncateString("abc", 10)).toBe("abc");
    expect(coerceStringArray(["a", "  ", 3, null, " b "])).toEqual(["a", "b"]);
  });
});

/**
 * The invariant that would have prevented the incident: whatever the provider
 * sends back, the normalizer returns a value the strict schema accepts, so no
 * structured answer can ever fail a run again.
 */
const TOTAL_NORMALIZERS: [string, (wire: unknown) => unknown, z.ZodType][] = [
  ["reviewPhaseResult", normalizeReviewPhaseResult, reviewPhaseResultSchema],
  ["chapterSummary", normalizeChapterSummary, chapterSummarySchema],
  ["critique", normalizeCritique, critiqueSchema],
  ["revision", normalizeRevision, revisionSchema],
  ["editSuggestionList", normalizeEditSuggestionList, editSuggestionListSchema],
  ["moderationVerdict", normalizeModerationVerdict, moderationVerdictSchema],
];

/**
 * The two answers that cannot be salvaged into something usable — a creative
 * question with no options, a concept with no prose — are total in the same
 * way, but their honest result is null. A caller that receives null keeps what
 * it already has; it never receives a hollow value it would then persist.
 */
const NULLABLE_NORMALIZERS: [string, (wire: unknown) => unknown, z.ZodType][] = [
  ["concept", normalizeConcept, conceptSchema],
  ["creativeQuestion", normalizeCreativeQuestion, creativeQuestionSchema],
];

const looseText = fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined));
const looseNumber = fc.oneof(fc.double(), fc.integer(), fc.string(), fc.constant(null));

/** Answers shaped like a review phase, but wrong in every way a model can be. */
const reviewPhaseLike = fc.record(
  {
    score: looseNumber,
    summary: looseText,
    strengths: fc.array(looseText, { maxLength: 20 }),
    issues: fc.array(
      fc.record(
        {
          chapters: fc.oneof(fc.array(looseNumber, { maxLength: 30 }), looseNumber),
          category: fc.oneof(
            fc.constantFrom("character", "pacing", "Timeline", "voice", "plot"),
            looseText,
          ),
          severity: fc.oneof(fc.constantFrom("critical", "high", "Minor", "blocker"), looseText),
          description: looseText,
          suggestedFix: looseText,
        },
        { requiredKeys: [] },
      ),
      { maxLength: 30 },
    ),
  },
  { requiredKeys: [] },
);

const cleanText = fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,20}[A-Za-z]$/);

/** Answers that were already valid — normalization must not touch them. */
const validReviewPhase = fc.record({
  score: fc.double({ min: 0, max: 1, noNaN: true }).map(Math.abs),
  summary: cleanText,
  strengths: fc.array(cleanText, { maxLength: 6 }),
  issues: fc.array(
    fc.record({
      chapters: fc.array(fc.integer({ min: 1, max: 60 }), { maxLength: 10 }),
      category: fc.constantFrom("character", "timeline", "setting", "plot", "factual"),
      severity: fc.constantFrom("critical", "major", "minor"),
      description: cleanText,
      suggestedFix: cleanText,
    }),
    { maxLength: 10 },
  ),
});

describe("normalizers are total", () => {
  it.each(TOTAL_NORMALIZERS)(
    "%s survives arbitrary provider output",
    (_name, normalize, schema) => {
      fc.assert(
        fc.property(fc.anything(), (input) => {
          expect(schema.safeParse(normalize(input)).success).toBe(true);
        }),
        { numRuns: 500 },
      );
    },
  );

  it("normalizeReviewPhaseResult survives review-shaped nonsense", () => {
    fc.assert(
      fc.property(reviewPhaseLike, (input) => {
        expect(reviewPhaseResultSchema.safeParse(normalizeReviewPhaseResult(input)).success).toBe(
          true,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("leaves an answer that was already valid exactly as it was", () => {
    fc.assert(
      fc.property(validReviewPhase, (input) => {
        expect(normalizeReviewPhaseResult(input)).toEqual(input);
      }),
    );
  });

  it.each(NULLABLE_NORMALIZERS)(
    "%s returns a usable value or an honest null",
    (_name, normalize, schema) => {
      fc.assert(
        fc.property(fc.anything(), (input) => {
          const result = normalize(input);
          expect(result === null || schema.safeParse(result).success).toBe(true);
        }),
        { numRuns: 500 },
      );
    },
  );
});
