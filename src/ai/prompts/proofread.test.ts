import { describe, expect, it } from "vitest";

import {
  resolveProofreadAnchors,
  withinMechanicalScope,
  type ProofreadCorrection,
} from "@/ai/agents/proofread";
import { findTextRange } from "@/lib/editor/doc-text";

import {
  buildProofreadUserPrompt,
  MAX_PROOFREAD_SUGGESTIONS,
  PROOFREAD_CATEGORIES,
  PROOFREAD_SYSTEM_PROMPT,
} from "./proofread";

function correction(over: Partial<ProofreadCorrection> = {}): ProofreadCorrection {
  return {
    anchorText: "She new the answer before he asked.",
    replacement: "She knew the answer before he asked.",
    rationale: "“New” should be “knew”.",
    category: "usage",
    severity: "error",
    ...over,
  };
}

/** N distinct tokens, so a replacement's changed-word count is exact. */
function tokens(count: number, prefix = "w"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

describe("PROOFREAD_SYSTEM_PROMPT", () => {
  it("lists the mechanical errors the pass exists to fix", () => {
    for (const item of [
      "Typos and misspellings",
      "Subject-verb agreement",
      "Comma splices and run-ons",
      "Dialogue punctuation",
      "Tense slips",
      "Repeated and duplicated words",
      "Homophones and commonly confused words",
      "Spacing",
      "Dashes and ellipses",
      "Capitalization",
    ]) {
      expect(PROOFREAD_SYSTEM_PROMPT).toContain(item);
    }
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("quote nesting");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("its/it's");
  });

  it("forbids voice, style, word choice, pacing, and structure outright", () => {
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("## Never touch these");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("**Voice.**");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("**Style.**");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("**Word choice.**");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("**Pacing, structure, and content.**");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain(
      "A proofreader who rewrites voice is worse than no proofreader at all",
    );
  });

  it("does not import the editorial pass's improve-the-prose mandate", () => {
    for (const editorial of [
      "Tighten Prose",
      "Strengthen Scenes",
      "Enhance Flow",
      "Strengthen weak sentences",
      "Improve Clarity",
    ]) {
      expect(PROOFREAD_SYSTEM_PROMPT).not.toContain(editorial);
    }
    // The editor's craft vocabulary appears here only as a prohibition.
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("No tightening, no stronger verbs");
  });

  it("demands a whole sentence in and the same whole sentence out", () => {
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("one whole sentence copied character for character");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("that same whole sentence, corrected");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain("return one entry per copy");
    expect(PROOFREAD_SYSTEM_PROMPT).toContain(
      "Never return a `replacement` identical to its `anchorText`",
    );
  });

  it("documents every category and severity the schema accepts", () => {
    for (const category of PROOFREAD_CATEGORIES) {
      expect(PROOFREAD_SYSTEM_PROMPT).toContain(`\`${category}\``);
    }
    for (const severity of ["error", "warning", "info"]) {
      expect(PROOFREAD_SYSTEM_PROMPT).toContain(`\`${severity}\``);
    }
  });

  it("carries nothing project-specific, so it stays a stable cache prefix", () => {
    const first = buildProofreadUserPrompt({ chapterNumber: 1, chapterContent: "One." });
    const second = buildProofreadUserPrompt({ chapterNumber: 9, chapterContent: "Nine." });
    expect(first).not.toEqual(second);
    expect(PROOFREAD_SYSTEM_PROMPT).not.toContain("One.");
    expect(PROOFREAD_SYSTEM_PROMPT).not.toContain("Chapter 1");
  });
});

describe("buildProofreadUserPrompt", () => {
  it("carries the chapter, its number, and the correction ceiling", () => {
    const prompt = buildProofreadUserPrompt({
      chapterNumber: 4,
      chapterContent: "The door was ajar. She new it would be.",
    });
    expect(prompt).toContain(`at most ${MAX_PROOFREAD_SUGGESTIONS} mechanical corrections`);
    expect(prompt).toContain("## Chapter 4\n\nThe door was ajar. She new it would be.");
    expect(prompt).toContain("Proofread chapter 4.");
  });
});

describe("withinMechanicalScope", () => {
  it("accepts the corrections the pass is for", () => {
    expect(withinMechanicalScope("She new the answer.", "She knew the answer.")).toBe(true);
    expect(withinMechanicalScope("He ran, it was late.", "He ran. It was late.")).toBe(true);
    expect(withinMechanicalScope("The the door opened.", "The door opened.")).toBe(true);
    expect(withinMechanicalScope("She said Hello.", "She said, “Hello.”")).toBe(true);
    expect(withinMechanicalScope("Its cold outside today.", "It's cold outside today.")).toBe(true);
  });

  it("rejects a rewrite dressed as a correction", () => {
    expect(
      withinMechanicalScope(
        "The rain fell hard against the old tin roof of the shed.",
        "Rain hammered the shed's rusting tin roof.",
      ),
    ).toBe(false);
  });

  it("rejects no-ops and deletions", () => {
    expect(withinMechanicalScope("Nothing changed here.", "Nothing changed here.")).toBe(false);
    expect(withinMechanicalScope("Cut this line entirely.", "")).toBe(false);
    expect(withinMechanicalScope("Cut this line entirely.", "   ")).toBe(false);
  });

  it("scales the allowance with sentence length", () => {
    const before = tokens(20).join(" ");
    const fiveChanged = [...tokens(15), ...tokens(5, "x")].join(" ");
    const sixChanged = [...tokens(14), ...tokens(6, "x")].join(" ");
    expect(withinMechanicalScope(before, fiveChanged)).toBe(true);
    expect(withinMechanicalScope(before, sixChanged)).toBe(false);
  });

  it("gives short sentences a flat allowance instead of a fractional one", () => {
    // 25% of four words is one; a dropped quote plus a capital is still mechanical.
    expect(withinMechanicalScope("come here he said", "“Come here,” he said.")).toBe(true);
  });

  it("refuses a quote too long to be the single sentence that was asked for", () => {
    const paragraph = tokens(250).join(" ");
    expect(withinMechanicalScope(paragraph, `${paragraph} more.`)).toBe(false);
  });
});

describe("resolveProofreadAnchors", () => {
  it("anchors a correction to the exact span it quoted", () => {
    const content = "The hall was dark. She new the answer before he asked. She waited.";
    const { resolved, unanchored, outOfScope } = resolveProofreadAnchors(content, [correction()]);

    expect(unanchored).toBe(0);
    expect(outOfScope).toBe(0);
    expect(resolved).toHaveLength(1);
    const [item] = resolved;
    expect(content.slice(item.start, item.end)).toBe(item.correction.anchorText);
    expect(item.occurrence).toBe(0);
  });

  it("gives each copy of a repeated sentence its own occurrence", () => {
    const line = "She new the answer before he asked.";
    const content = `${line} A door closed. ${line} Then nothing.`;
    const { resolved, unanchored } = resolveProofreadAnchors(content, [correction(), correction()]);

    expect(unanchored).toBe(0);
    expect(resolved.map((r) => r.occurrence)).toEqual([0, 1]);
    expect(resolved[0].start).toBeLessThan(resolved[1].start);
    for (const item of resolved) {
      expect(content.slice(item.start, item.end)).toBe(line);
    }
  });

  it("records occurrences the editor's own lookup agrees with", () => {
    const line = "She new the answer before he asked.";
    const content = `${line} A door closed. ${line} Then nothing.`;
    const { resolved } = resolveProofreadAnchors(content, [correction(), correction()]);

    for (const item of resolved) {
      // The suggestion plugin re-finds anchors this way in the live document.
      expect(findTextRange(content, item.correction.anchorText, item.occurrence)).toEqual({
        start: item.start,
        end: item.end,
      });
    }
  });

  it("counts a quote that is not in the chapter as unanchored", () => {
    const { resolved, unanchored } = resolveProofreadAnchors("Nothing like it here.", [
      correction(),
    ]);
    expect(resolved).toHaveLength(0);
    expect(unanchored).toBe(1);
  });

  it("counts corrections beyond the number of copies as unanchored", () => {
    const content = "She new the answer before he asked. The end.";
    const { resolved, unanchored } = resolveProofreadAnchors(content, [correction(), correction()]);
    expect(resolved).toHaveLength(1);
    expect(unanchored).toBe(1);
  });

  it("drops a rewrite without letting it consume a duplicate's slot", () => {
    const line = "She new the answer before he asked.";
    const content = `${line} A door closed. ${line} Then nothing.`;
    const { resolved, outOfScope } = resolveProofreadAnchors(content, [
      correction({ replacement: "The answer had been hers all along, long before the question." }),
      correction(),
    ]);

    expect(outOfScope).toBe(1);
    expect(resolved).toHaveLength(1);
    // The surviving correction still claims the first copy, not the second.
    expect(resolved[0].occurrence).toBe(0);
    expect(resolved[0].start).toBe(content.indexOf(line));
  });

  it("returns nothing for a clean chapter", () => {
    expect(resolveProofreadAnchors("Clean prose, start to finish.", [])).toEqual({
      resolved: [],
      unanchored: 0,
      outOfScope: 0,
    });
  });
});
