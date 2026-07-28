import { describe, expect, it } from "vitest";

import {
  FIVE_ACT_STRUCTURE,
  HEROS_JOURNEY,
  PLOT_STRUCTURE_IDS,
  PLOT_TEMPLATES,
  SAVE_THE_CAT,
  SEVEN_POINT_STRUCTURE,
  THREE_ACT_STRUCTURE,
  chapterAssignments,
  chapterGuidance,
  getAllTemplateNames,
  getPlotTemplate,
  getTemplateSummary,
  suggestEmotionalArc,
  type PlotTemplate,
} from "./plot-structures";

const CANONICAL_TEMPLATES: [string, PlotTemplate, number][] = [
  ["three_act", THREE_ACT_STRUCTURE, 9],
  ["five_act", FIVE_ACT_STRUCTURE, 7],
  ["heros_journey", HEROS_JOURNEY, 12],
  ["seven_point", SEVEN_POINT_STRUCTURE, 7],
  ["save_the_cat", SAVE_THE_CAT, 15],
];

describe("plot structure data completeness", () => {
  it("registers all five canonical structures plus the freytags_pyramid alias", () => {
    expect(PLOT_STRUCTURE_IDS).toHaveLength(6);
    for (const id of PLOT_STRUCTURE_IDS) {
      expect(PLOT_TEMPLATES[id]).toBeDefined();
    }
    expect(PLOT_TEMPLATES.freytags_pyramid).toBe(FIVE_ACT_STRUCTURE);
    expect(getAllTemplateNames()).toEqual([...PLOT_STRUCTURE_IDS]);
  });

  it.each(CANONICAL_TEMPLATES)("%s has the expected beat count", (id, template, beatCount) => {
    expect(getPlotTemplate(id)).toBe(template);
    expect(template.structureType).toBe(id);
    expect(template.beats).toHaveLength(beatCount);
  });

  it.each(CANONICAL_TEMPLATES)(
    "%s beats have valid, ordered percentages and non-empty text",
    (_id, template) => {
      let previous = -Infinity;
      for (const beat of template.beats) {
        expect(beat.name.length).toBeGreaterThan(0);
        expect(beat.description.length).toBeGreaterThan(0);
        expect(beat.tips.length).toBeGreaterThan(0);

        expect(beat.percentageThroughStory).toBeGreaterThanOrEqual(0);
        expect(beat.percentageThroughStory).toBeLessThanOrEqual(1);
        expect(beat.chapterRangeStart).toBeGreaterThanOrEqual(0);
        expect(beat.chapterRangeEnd).toBeLessThanOrEqual(1);
        expect(beat.chapterRangeStart).toBeLessThanOrEqual(beat.chapterRangeEnd);

        // Beats are listed in story order.
        expect(beat.percentageThroughStory).toBeGreaterThanOrEqual(previous);
        previous = beat.percentageThroughStory;
      }
    },
  );

  it("preserves the hero's journey stage names in order", () => {
    expect(HEROS_JOURNEY.beats.map((b) => b.name)).toEqual([
      "Ordinary World",
      "Call to Adventure",
      "Refusal of Call",
      "Meeting Mentor",
      "Crossing Threshold",
      "Tests Allies Enemies",
      "Approach Innermost Cave",
      "Ordeal",
      "Reward",
      "Road Back",
      "Resurrection",
      "Return with Elixir",
    ]);
  });

  it("preserves genre modifications for three_act and heros_journey", () => {
    expect(Object.keys(THREE_ACT_STRUCTURE.genreModifications)).toEqual([
      "romance",
      "mystery",
      "thriller",
    ]);
    expect(THREE_ACT_STRUCTURE.genreModifications.mystery).toContain(
      "Inciting incident is typically the crime",
    );
    expect(HEROS_JOURNEY.genreModifications.fantasy).toContain(
      "Mentor often has magical abilities",
    );
  });
});

describe("getPlotTemplate", () => {
  it("returns undefined for unknown structure types", () => {
    expect(getPlotTemplate("snowflake")).toBeUndefined();
  });

  it("resolves the freytags_pyramid alias to the five-act template", () => {
    expect(getPlotTemplate("freytags_pyramid")).toBe(FIVE_ACT_STRUCTURE);
  });
});

describe("getTemplateSummary", () => {
  it("summarizes a template with beat names and percentages", () => {
    const summary = getTemplateSummary("save_the_cat");
    expect(summary).toBeDefined();
    expect(summary?.name).toBe("Save the Cat Beat Sheet");
    expect(summary?.beatCount).toBe(15);
    expect(summary?.beats[0]).toEqual({
      name: "Opening Image",
      description: "A visual that represents the protagonist's starting point.",
      percentage: 0.0,
    });
  });

  it("returns undefined for unknown structure types", () => {
    expect(getTemplateSummary("nope")).toBeUndefined();
  });
});

describe("chapterAssignments", () => {
  it("assigns chapters to beats for three_act with 20 chapters", () => {
    const assignments = chapterAssignments("three_act", 20);
    expect(assignments).toBeDefined();
    expect(assignments?.["Act One (Setup)"]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(assignments?.["Act Three (Resolution)"]).toEqual([16, 17, 18, 19, 20]);
  });

  it("returns undefined for unknown structure types", () => {
    expect(chapterAssignments("nope", 10)).toBeUndefined();
  });
});

describe("chapterGuidance", () => {
  it("returns opening-beat guidance for chapter 1 of a three-act book", () => {
    const guidance = chapterGuidance("three_act", 1, 20);
    expect(guidance).toBeDefined();
    expect(guidance?.chapterNumber).toBe(1);
    expect(guidance?.percentageThroughStory).toBe(0);
    expect(guidance?.currentBeat.name).toBe("Act One (Setup)");
    expect(guidance?.currentBeat.emotionalArc).toBe("exposition");
    expect(guidance?.currentBeat.tips).toContain("Establish the protagonist's ordinary world");
    expect(guidance?.structureContext).toBe(THREE_ACT_STRUCTURE.description);
    expect(guidance?.nextBeat?.name).toBe("Inciting Incident");
    expect(guidance?.nextBeat?.chaptersUntil).toBe(2);
  });

  it("places a middle chapter in Act Two with the Midpoint upcoming", () => {
    const guidance = chapterGuidance("three_act", 10, 20);
    expect(guidance?.currentBeat.name).toBe("Act Two (Confrontation)");
    expect(guidance?.currentBeat.emotionalArc).toBe("tension_building");
    expect(guidance?.nextBeat?.name).toBe("Midpoint");
    expect(guidance?.nextBeat?.chaptersUntil).toBe(0);
  });

  it("places the final chapter of a hero's journey in Return with Elixir with no next beat", () => {
    const guidance = chapterGuidance("heros_journey", 12, 12);
    expect(guidance?.percentageThroughStory).toBe(1);
    expect(guidance?.currentBeat.name).toBe("Return with Elixir");
    expect(guidance?.nextBeat).toBeUndefined();
  });

  it("falls back to the nearest upcoming beat in a seven-point range gap", () => {
    // percentage = 11/100 = 0.11 sits between Hook (ends 0.10) and Plot Turn 1 (starts 0.12)
    const guidance = chapterGuidance("seven_point", 12, 101);
    expect(guidance?.currentBeat.name).toBe("Plot Turn 1");
    expect(guidance?.nextBeat).toBeUndefined();
  });

  it("handles a single-chapter book without dividing by zero", () => {
    const guidance = chapterGuidance("save_the_cat", 1, 1);
    expect(guidance?.percentageThroughStory).toBe(0);
    expect(guidance?.currentBeat.name).toBe("Opening Image");
  });

  it("returns undefined for unknown structure types", () => {
    expect(chapterGuidance("nope", 1, 10)).toBeUndefined();
  });
});

describe("suggestEmotionalArc", () => {
  it("returns exposition at the start of a story", () => {
    expect(suggestEmotionalArc("heros_journey", 1, 12)).toBe("exposition");
    expect(suggestEmotionalArc("save_the_cat", 1, 15)).toBe("exposition");
  });

  it("returns tension_building in the middle of a three-act story", () => {
    expect(suggestEmotionalArc("three_act", 10, 20)).toBe("tension_building");
  });

  it("returns denouement at the end of a hero's journey", () => {
    expect(suggestEmotionalArc("heros_journey", 12, 12)).toBe("denouement");
  });

  it("defaults to rising_action for unknown structures and uncovered gaps", () => {
    expect(suggestEmotionalArc("nope", 5, 10)).toBe("rising_action");
    // 0.11 falls in the seven-point gap between Hook and Plot Turn 1.
    expect(suggestEmotionalArc("seven_point", 12, 101)).toBe("rising_action");
  });
});
