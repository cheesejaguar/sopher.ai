import { describe, expect, it } from "vitest";

import {
  CHILDREN_AUTO_AVOID_TOPICS,
  MATURE_CONTENT_GUIDELINES,
  MIDDLE_GRADE_AUTO_AVOID_TOPICS,
  PROFANITY_GUIDELINES,
  THEME_GUIDELINES,
  VIOLENCE_GUIDELINES,
  VOCABULARY_LEVELS,
  buildContentFilterPrompt,
  contentGuidelinesToPromptSection,
  generateContentGuidelines,
  parseTargetAudience,
  type AudienceLevel,
} from "./content-filter";

const AUDIENCES: AudienceLevel[] = ["children", "middle_grade", "young_adult", "adult"];

describe("guidance data completeness", () => {
  it("covers every audience level in every guideline map", () => {
    for (const audience of AUDIENCES) {
      expect(VIOLENCE_GUIDELINES[audience]).toBeDefined();
      expect(PROFANITY_GUIDELINES[audience].allowed.length).toBeGreaterThan(0);
      expect(PROFANITY_GUIDELINES[audience].disallowed.length).toBeGreaterThan(0);
      expect(MATURE_CONTENT_GUIDELINES[audience].allowed.length).toBeGreaterThan(0);
      expect(MATURE_CONTENT_GUIDELINES[audience].disallowed.length).toBeGreaterThan(0);
      expect(VOCABULARY_LEVELS[audience].length).toBeGreaterThan(0);
      expect(THEME_GUIDELINES[audience].length).toBeGreaterThan(0);
    }
  });

  it("restricts violence options by audience as in the original", () => {
    expect(Object.keys(VIOLENCE_GUIDELINES.children)).toEqual(["none", "mild"]);
    expect(Object.keys(VIOLENCE_GUIDELINES.middle_grade)).toEqual(["none", "mild", "moderate"]);
    expect(Object.keys(VIOLENCE_GUIDELINES.young_adult)).toEqual([
      "none",
      "mild",
      "moderate",
      "graphic",
    ]);
    expect(Object.keys(VIOLENCE_GUIDELINES.adult)).toEqual(["none", "mild", "moderate", "graphic"]);
  });

  it("preserves the original guidance wording (spot checks)", () => {
    expect(VIOLENCE_GUIDELINES.children.mild).toBe(
      "Only very mild cartoon-style conflict allowed. No injury or harm.",
    );
    expect(VIOLENCE_GUIDELINES.adult.graphic).toBe(
      "Graphic violence allowed within story context. Avoid gratuitous violence.",
    );
    expect(PROFANITY_GUIDELINES.middle_grade.allowed).toBe(
      "Mild swearing only (damn, hell). No strong profanity.",
    );
    expect(MATURE_CONTENT_GUIDELINES.young_adult.disallowed).toBe(
      "Handle mature topics carefully. Fade to black for any romantic intimacy.",
    );
    expect(THEME_GUIDELINES.children).toContain("Good triumphs over challenges.");
  });
});

describe("parseTargetAudience", () => {
  it("detects each audience level from indicator terms", () => {
    expect(parseTargetAudience("Children ages 6-10")).toBe("children");
    expect(parseTargetAudience("elementary readers")).toBe("children");
    expect(parseTargetAudience("Middle Grade")).toBe("middle_grade");
    expect(parseTargetAudience("tweens in middle school")).toBe("middle_grade");
    expect(parseTargetAudience("Young Adult")).toBe("young_adult");
    expect(parseTargetAudience("teen readers 14-18")).toBe("young_adult");
    expect(parseTargetAudience("general adult")).toBe("adult");
    expect(parseTargetAudience("literary fiction readers")).toBe("adult");
  });

  it("checks children indicators before middle grade and young adult", () => {
    // "kids in middle school" contains both "kid" and "middle school"
    expect(parseTargetAudience("kids in middle school")).toBe("children");
  });
});

describe("generateContentGuidelines", () => {
  it("clamps graphic violence to mild for children", () => {
    const guidelines = generateContentGuidelines({
      targetAudience: "children",
      violenceLevel: "graphic",
    });
    expect(guidelines.violenceLevel).toBe("mild");
    expect(guidelines.violenceInstruction).toBe(VIOLENCE_GUIDELINES.children.mild);
  });

  it("clamps graphic violence to moderate for middle grade", () => {
    const guidelines = generateContentGuidelines({
      targetAudience: "middle grade",
      violenceLevel: "graphic",
    });
    expect(guidelines.violenceLevel).toBe("moderate");
    expect(guidelines.violenceInstruction).toBe(VIOLENCE_GUIDELINES.middle_grade.moderate);
  });

  it("never allows profanity or mature content for children", () => {
    const guidelines = generateContentGuidelines({
      targetAudience: "kids",
      profanity: true,
      matureContent: true,
    });
    expect(guidelines.profanityInstruction).toBe(PROFANITY_GUIDELINES.children.disallowed);
    expect(guidelines.matureContentInstruction).toBe(MATURE_CONTENT_GUIDELINES.children.disallowed);
  });

  it("respects profanity and mature flags for adults", () => {
    const allowed = generateContentGuidelines({
      targetAudience: "adult",
      profanity: true,
      matureContent: true,
      violenceLevel: "graphic",
    });
    expect(allowed.profanityInstruction).toBe(PROFANITY_GUIDELINES.adult.allowed);
    expect(allowed.matureContentInstruction).toBe(MATURE_CONTENT_GUIDELINES.adult.allowed);
    expect(allowed.violenceLevel).toBe("graphic");

    const disallowed = generateContentGuidelines({ targetAudience: "adult" });
    expect(disallowed.profanityInstruction).toBe(PROFANITY_GUIDELINES.adult.disallowed);
    expect(disallowed.violenceLevel).toBe("mild"); // schema default
  });

  it("adds automatic avoid topics for younger audiences without duplicates", () => {
    const children = generateContentGuidelines({
      targetAudience: "children",
      avoidTopics: ["spiders", "substance abuse"],
    });
    expect(children.avoidTopics).toEqual([
      "spiders",
      "substance abuse",
      ...CHILDREN_AUTO_AVOID_TOPICS.filter((t) => t !== "substance abuse"),
    ]);

    const middleGrade = generateContentGuidelines({ targetAudience: "middle grade" });
    expect(middleGrade.avoidTopics).toEqual([...MIDDLE_GRADE_AUTO_AVOID_TOPICS]);

    const adult = generateContentGuidelines({ targetAudience: "adult" });
    expect(adult.avoidTopics).toEqual([]);
  });
});

describe("contentGuidelinesToPromptSection / buildContentFilterPrompt", () => {
  it("renders the full prompt section with title-cased audience", () => {
    const section = buildContentFilterPrompt({
      targetAudience: "middle grade",
      violenceLevel: "mild",
    });
    expect(section).toContain("## Content Guidelines");
    expect(section).toContain("**Target Audience:** Middle Grade");
    expect(section).toContain("### Content Restrictions");
    expect(section).toContain(`- **Violence:** ${VIOLENCE_GUIDELINES.middle_grade.mild}`);
    expect(section).toContain("### Writing Style");
    expect(section).toContain("### Topics to Avoid");
    expect(section).toContain("The following topics must NOT appear in the content:");
    expect(section).toContain("- explicit violence");
    expect(section).toContain(
      "**IMPORTANT:** These content guidelines are mandatory. " +
        "Any content that violates these restrictions will be rejected.",
    );
  });

  it("omits the topics section when there are none", () => {
    const section = contentGuidelinesToPromptSection(
      generateContentGuidelines({ targetAudience: "adult" }),
    );
    expect(section).not.toContain("### Topics to Avoid");
    expect(section).toContain("**Target Audience:** Adult");
  });

  it("returns an empty string when settings are missing", () => {
    expect(buildContentFilterPrompt(undefined)).toBe("");
    expect(buildContentFilterPrompt(null)).toBe("");
  });
});
