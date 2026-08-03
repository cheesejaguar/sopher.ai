import { describe, expect, it } from "vitest";

import {
  FANTASY_TEMPLATE,
  GENRE_ALIASES,
  GENRE_IDS,
  GENRE_TEMPLATES,
  LITERARY_FICTION_TEMPLATE,
  SCIENCE_FICTION_TEMPLATE,
  chapterPromptForGenre,
  genreAudience,
  genreAvoidList,
  genreReaderExpectations,
  getGenreSummary,
  getGenreTemplate,
  isNonFictionGenre,
  outlinePromptAdditions,
  type ChapterPosition,
} from "./genres";

const CHAPTER_POSITIONS: ChapterPosition[] = [
  "opening",
  "early",
  "midpoint",
  "late",
  "climax",
  "ending",
];

describe("genre data completeness", () => {
  it("has exactly 12 canonical genres", () => {
    expect(GENRE_IDS).toHaveLength(12);
    expect([...GENRE_IDS].sort()).toEqual(
      [
        "romance",
        "mystery",
        "fantasy",
        "thriller",
        "literary_fiction",
        "science_fiction",
        "horror",
        "historical_fiction",
        "young_adult",
        "middle_grade",
        "childrens",
        "memoir",
      ].sort(),
    );
  });

  it("maps every genre id to a template with a unique display name", () => {
    const names = GENRE_IDS.map((id) => GENRE_TEMPLATES[id].genre);
    expect(new Set(names).size).toBe(12);
    expect(names).toEqual([
      "Romance",
      "Mystery",
      "Fantasy",
      "Thriller",
      "Literary Fiction",
      "Science Fiction",
      "Horror",
      "Historical Fiction",
      "Young Adult",
      "Middle Grade",
      "Children's",
      "Memoir",
    ]);
  });

  it("bands the audience genres and marks memoir as the only non-fiction form", () => {
    expect(genreAudience("childrens")).toBe("children");
    expect(genreAudience("middle_grade")).toBe("middle_grade");
    expect(genreAudience("young_adult")).toBe("young_adult");
    // The original seven carry no explicit audience and must read as adult.
    expect(genreAudience("romance")).toBe("adult");
    expect(genreAudience("memoir")).toBe("adult");
    // An unknown or free-text genre must degrade to adult rather than throw.
    expect(genreAudience("steampunk western")).toBe("adult");
    expect(genreAudience(null)).toBe("adult");

    const nonFiction = GENRE_IDS.filter((id) => GENRE_TEMPLATES[id].nonFiction === true);
    expect(nonFiction).toEqual(["memoir"]);
    expect(isNonFictionGenre("memoir")).toBe(true);
    expect(isNonFictionGenre("fantasy")).toBe(false);
    expect(isNonFictionGenre("steampunk western")).toBe(false);
  });

  it("gives the young-reader genres shorter chapter defaults than adult genres", () => {
    // A children's chapter defaulting to an adult 3,000 words produces a book
    // no six-year-old can read; the defaults are the guard against that.
    expect(GENRE_TEMPLATES.childrens.defaultWordsPerChapter).toBeLessThan(1_000);
    expect(GENRE_TEMPLATES.middle_grade.defaultWordsPerChapter).toBeLessThan(2_000);
    expect(GENRE_TEMPLATES.childrens.defaultWordsPerChapter).toBeLessThan(
      GENRE_TEMPLATES.middle_grade.defaultWordsPerChapter!,
    );
    expect(GENRE_TEMPLATES.middle_grade.defaultWordsPerChapter).toBeLessThan(
      GENRE_TEMPLATES.young_adult.defaultWordsPerChapter!,
    );
    // The original seven stay unopinionated so existing projects are unchanged.
    expect(GENRE_TEMPLATES.romance.defaultWordsPerChapter).toBeUndefined();
  });

  it("resolves the new aliases people actually type", () => {
    expect(getGenreTemplate("YA")?.genre).toBe("Young Adult");
    expect(getGenreTemplate("children's")?.genre).toBe("Children's");
    expect(getGenreTemplate("chapter book")?.genre).toBe("Children's");
    expect(getGenreTemplate("middle-grade")?.genre).toBe("Middle Grade");
    expect(getGenreTemplate("historical")?.genre).toBe("Historical Fiction");
    expect(getGenreTemplate("autobiography")?.genre).toBe("Memoir");
  });

  it.each(GENRE_IDS.map((id) => [id] as const))("%s template is fully populated", (id) => {
    const template = GENRE_TEMPLATES[id];

    expect(template.description.length).toBeGreaterThan(0);
    expect(template.pacingNotes.length).toBeGreaterThan(0);

    expect(template.coreElements.length).toBeGreaterThanOrEqual(4);
    expect(template.coreElements.some((e) => e.required)).toBe(true);
    for (const elem of template.coreElements) {
      expect(elem.name.length).toBeGreaterThan(0);
      expect(elem.description.length).toBeGreaterThan(0);
      expect(elem.whenToInclude.length).toBeGreaterThan(0);
      expect(elem.tips.length).toBeGreaterThan(0);
    }

    for (const position of CHAPTER_POSITIONS) {
      expect(template.chapterGuidance[position].length).toBeGreaterThan(0);
    }

    expect(template.toneRecommendations).toHaveLength(4);
    expect(template.commonTropes).toHaveLength(8);
    expect(template.avoidList.length).toBeGreaterThanOrEqual(5);
    expect(template.readerExpectations).toHaveLength(5);
    expect(template.subgenres).toHaveLength(6);
  });

  it("preserves the recommended (non-required) elements", () => {
    const fantasyRecommended = FANTASY_TEMPLATE.coreElements
      .filter((e) => !e.required)
      .map((e) => e.name);
    expect(fantasyRecommended).toEqual([
      "Chosen One/Special Status",
      "Fantastical Creatures/Races",
    ]);

    const literaryRecommended = LITERARY_FICTION_TEMPLATE.coreElements
      .filter((e) => !e.required)
      .map((e) => e.name);
    expect(literaryRecommended).toEqual(["Moral Ambiguity"]);
  });
});

describe("getGenreTemplate", () => {
  it("resolves canonical names case-insensitively", () => {
    expect(getGenreTemplate("romance")).toBe(GENRE_TEMPLATES.romance);
    expect(getGenreTemplate("Romance")).toBe(GENRE_TEMPLATES.romance);
    expect(getGenreTemplate("HORROR")).toBe(GENRE_TEMPLATES.horror);
  });

  it("normalizes spaces to underscores", () => {
    expect(getGenreTemplate("Literary Fiction")).toBe(LITERARY_FICTION_TEMPLATE);
    expect(getGenreTemplate("Science Fiction")).toBe(SCIENCE_FICTION_TEMPLATE);
  });

  it("resolves aliases", () => {
    expect(getGenreTemplate("literary")).toBe(LITERARY_FICTION_TEMPLATE);
    expect(getGenreTemplate("sci-fi")).toBe(SCIENCE_FICTION_TEMPLATE);
    expect(getGenreTemplate("Sci-Fi")).toBe(SCIENCE_FICTION_TEMPLATE);
    expect(getGenreTemplate("scifi")).toBe(SCIENCE_FICTION_TEMPLATE);
    expect(getGenreTemplate("sf")).toBe(SCIENCE_FICTION_TEMPLATE);
    for (const target of Object.values(GENRE_ALIASES)) {
      expect(GENRE_TEMPLATES[target]).toBeDefined();
    }
  });

  it("returns undefined for unknown genres", () => {
    expect(getGenreTemplate("western")).toBeUndefined();
    expect(getGenreTemplate("")).toBeUndefined();
  });
});

describe("outlinePromptAdditions", () => {
  it("renders the romance template in the Python format", () => {
    const prompt = outlinePromptAdditions("romance");
    expect(prompt).toBeDefined();
    const text = prompt as string;

    // Header and description rendering, including original blank-line layout.
    expect(text.startsWith("\n## Genre Requirements: Romance\n\nStories centered on")).toBe(true);
    expect(text).toContain("\n### Core Elements (must include):\n");

    // Required element rendering: name, description, when, joined tips.
    expect(text).toContain(
      "- **Meet-Cute**: The first meeting between the romantic leads, often memorable or unusual.",
    );
    expect(text).toContain("  - When: First 10-15% of story");
    expect(text).toContain(
      "  - Tips: Make it memorable and specific to your characters; Show initial chemistry or tension; Plant seeds for their connection",
    );

    // Sections.
    expect(text).toContain("\n### Reader Expectations:\n");
    expect(text).toContain("- The central relationship is the main plot, not a subplot");
    expect(text).toContain(
      "\n### Pacing Notes:\nRomance requires careful pacing of the relationship development.",
    );
    expect(text).toContain("\n### Avoid:\n");
    expect(text).toContain("- Love triangles that don't resolve cleanly");
  });

  it("omits non-required elements from the core elements section", () => {
    const prompt = outlinePromptAdditions("fantasy") as string;
    expect(prompt).toContain("- **World Building**:");
    expect(prompt).toContain("- **Magic System**:");
    expect(prompt).not.toContain("Chosen One/Special Status");
    expect(prompt).not.toContain("Fantastical Creatures/Races");
  });

  it("works through aliases and returns undefined for unknown genres", () => {
    expect(outlinePromptAdditions("sci-fi")).toContain("## Genre Requirements: Science Fiction");
    expect(outlinePromptAdditions("western")).toBeUndefined();
  });
});

describe("chapterPromptForGenre", () => {
  it("returns the exact guidance for a position", () => {
    expect(chapterPromptForGenre("thriller", "opening")).toBe(
      "Start in media res or with an immediate hook. Establish the threat and stakes quickly. The protagonist should be capable but in over their head.",
    );
    expect(chapterPromptForGenre("horror", "ending")).toBe(
      "The aftermath. Is the threat truly gone? Show the cost. Horror often ends with a final twist or lingering unease.",
    );
  });

  it("returns an empty string for unknown genres", () => {
    expect(chapterPromptForGenre("western", "opening")).toBe("");
  });
});

describe("avoid lists and reader expectations", () => {
  it("exposes the mystery avoid list", () => {
    const avoid = genreAvoidList("mystery");
    expect(avoid).toContain("Culprits introduced at the last minute");
    expect(avoid).toContain("Solutions that rely on information never given to readers");
  });

  it("exposes horror reader expectations", () => {
    const expectations = genreReaderExpectations("horror");
    expect(expectations).toHaveLength(5);
    expect(expectations).toContain("To be genuinely frightened");
  });

  it("returns empty arrays for unknown genres", () => {
    expect(genreAvoidList("western")).toEqual([]);
    expect(genreReaderExpectations("western")).toEqual([]);
  });
});

describe("getGenreSummary", () => {
  it("summarizes a genre resolved via alias", () => {
    const summary = getGenreSummary("sf");
    expect(summary?.genre).toBe("Science Fiction");
    expect(summary?.coreElementCount).toBe(4);
    expect(summary?.coreElements[0]).toEqual({ name: "Speculative Element", required: true });
    expect(summary?.subgenres).toContain("Space Opera");
  });

  it("returns undefined for unknown genres", () => {
    expect(getGenreSummary("western")).toBeUndefined();
  });
});
