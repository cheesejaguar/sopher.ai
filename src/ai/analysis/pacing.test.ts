import { describe, expect, it } from "vitest";

import {
  ACTION_WORDS,
  CALM_WORDS,
  CLIFFHANGER_WORDS,
  REFLECTION_WORDS,
  TENSION_LEVELS,
  TENSION_WORDS,
  UNRESOLVED_WORDS,
  analyzeActionBalance,
  analyzeEnding,
  analyzePacing,
  analyzeScene,
  analyzeSceneDistribution,
  analyzeTensionCurve,
  calculateTensionLevel,
  splitIntoScenes,
} from "./pacing";

/**
 * Real ~190-word prose fixture: five scenes moving calm -> storm -> aftermath,
 * ending on an unresolved hook.
 */
const PACING_FIXTURE = [
  "The harbor was quiet at dawn, calm water lying flat beneath a gentle mist. Tomas walked the pier slowly, content to watch the gulls, feeling the peaceful rhythm of a town not yet awake.",
  "By noon the storm had turned the sky green. He ran for the boathouse as the first wave struck the seawall, and the spray hurled itself across the road. A mooring line snapped. The old ferry slammed against the dock, and somewhere behind him a woman screamed.",
  "He grabbed the rope and pulled, boots sliding on wet planks. The boat swung wide, crashed into the pilings, and burst a seam below the waterline. Danger was everywhere now, in the water, in the wind, in the groaning timbers of the pier.",
  "Then, as quickly as it had come, the storm rolled east. The water calmed. Tomas sat on the ruined dock, feeling his heart slow, watching the clouds break apart into soft evening light.",
  "But the ferry was gone, and with it the only way off the island before winter. He wondered what they would do when the food ran out. Could they last until spring?",
].join("\n\n");

describe("data completeness", () => {
  it("preserves all 77 action words", () => {
    expect(ACTION_WORDS.size).toBe(77);
    for (const w of ["ran", "lunged", "burst", "hurled", "tumble"]) {
      expect(ACTION_WORDS.has(w)).toBe(true);
    }
  });

  it("preserves all 60 reflection words", () => {
    expect(REFLECTION_WORDS.size).toBe(60);
    for (const w of ["wondered", "yearned", "contemplated", "feeling", "long"]) {
      expect(REFLECTION_WORDS.has(w)).toBe(true);
    }
  });

  it("preserves all 46 unique tension words, including the source's phrase entry", () => {
    expect(TENSION_WORDS.size).toBe(46);
    for (const w of ["suddenly", "danger", "screamed", "heart pounded", "foe"]) {
      expect(TENSION_WORDS.has(w)).toBe(true);
    }
  });

  it("preserves all 25 unique calm words", () => {
    expect(CALM_WORDS.size).toBe(25);
    for (const w of ["peaceful", "tranquil", "cozy", "still"]) {
      expect(CALM_WORDS.has(w)).toBe(true);
    }
  });

  it("preserves cliffhanger and unresolved word lists", () => {
    expect(CLIFFHANGER_WORDS.size).toBe(11);
    for (const w of ["suddenly", "moment", "but", "until"]) {
      expect(CLIFFHANGER_WORDS.has(w)).toBe(true);
    }
    expect(UNRESOLVED_WORDS.size).toBe(13);
    for (const w of ["would", "whether", "waiting", "unknown"]) {
      expect(UNRESOLVED_WORDS.has(w)).toBe(true);
    }
  });

  it("orders tension levels 1..5", () => {
    expect(TENSION_LEVELS.very_low).toBe(1);
    expect(TENSION_LEVELS.low).toBe(2);
    expect(TENSION_LEVELS.medium).toBe(3);
    expect(TENSION_LEVELS.high).toBe(4);
    expect(TENSION_LEVELS.climactic).toBe(5);
  });
});

describe("calculateTensionLevel", () => {
  it("returns climactic for action-dense text", () => {
    expect(calculateTensionLevel("He ran and jumped and fought and struck.")).toBe(5);
  });

  it("returns very low for calm-dense text", () => {
    expect(calculateTensionLevel("The peaceful garden was calm and quiet and serene.")).toBe(1);
  });

  it("returns medium for neutral text", () => {
    expect(calculateTensionLevel("The report considered the quarterly figures.")).toBe(3);
  });

  it("returns high when 'suddenly' appears without a high tension ratio", () => {
    const text =
      "Suddenly the chamber seemed different to everyone gathered there in the " +
      "great hall beneath the tall arching windows of stone.";
    expect(calculateTensionLevel(text)).toBe(4);
  });

  it("returns high for exclamations", () => {
    expect(calculateTensionLevel("Watch out!")).toBe(4);
  });

  it("returns medium for empty text", () => {
    expect(calculateTensionLevel("")).toBe(3);
  });
});

describe("analyzeTensionCurve", () => {
  it("produces a single flat point for short text", () => {
    const curve = analyzeTensionCurve("Just a few words of quiet narrative here.");
    expect(curve.tensionPoints.length).toBe(1);
    expect(curve.peakPosition).toBe(0);
    expect(curve.curveType).toBe("flat");
  });

  it("returns an empty default curve for empty text", () => {
    const curve = analyzeTensionCurve("");
    expect(curve.tensionPoints).toEqual([]);
    expect(curve.averageTension).toBe(0);
    expect(curve.curveType).toBe("flat");
  });
});

describe("analyzeScene", () => {
  it("classifies dialogue scenes", () => {
    const scene = analyzeScene(
      '"Hi," she said. "Where were you?" he asked. "Out walking," she said.',
    );
    expect(scene.sceneType).toBe("dialogue");
    expect(scene.dialogueRatio).toBeGreaterThan(0.4);
    expect(scene.estimatedReadTimeSeconds).toBe(2);
  });

  it("classifies action scenes with high tension", () => {
    const scene = analyzeScene("He ran and jumped and fought.");
    expect(scene.sceneType).toBe("action");
    expect(scene.tensionLevel).toBe(5);
  });

  it("classifies reflection scenes", () => {
    const scene = analyzeScene(
      "She wondered about the past and remembered the summer days without regret.",
    );
    expect(scene.sceneType).toBe("reflection");
  });

  it("classifies description scenes", () => {
    const scene = analyzeScene("The mountains stretched toward the horizon under a pale sky.");
    expect(scene.sceneType).toBe("description");
    expect(scene.tensionLevel).toBe(3);
  });
});

describe("splitIntoScenes / analyzeSceneDistribution", () => {
  it("splits on blank lines and asterisk breaks", () => {
    expect(splitIntoScenes("scene one text\n***\nscene two text").length).toBe(2);
    expect(splitIntoScenes("scene one\n\nscene two\n\nscene three").length).toBe(3);
  });

  it("computes distribution statistics", () => {
    const text = [
      "one two three",
      "one two three four five six seven eight nine ten eleven twelve",
      "one two",
    ].join("\n\n");
    const dist = analyzeSceneDistribution(text);
    expect(dist.totalScenes).toBe(3);
    expect(dist.shortestScene).toBe(2);
    expect(dist.longestScene).toBe(12);
    expect(dist.varietyScore).toBeGreaterThan(0.5);
    expect(dist.varietyScore).toBeLessThanOrEqual(1);
  });

  it("treats unbroken text as a single scene with zero variety", () => {
    const dist = analyzeSceneDistribution("just one scene here");
    expect(dist.totalScenes).toBe(1);
    expect(dist.stdDeviation).toBe(0);
    expect(dist.varietyScore).toBe(0);
  });
});

describe("analyzeActionBalance", () => {
  it("scores a well-balanced passage highly", () => {
    const balance = analyzeActionBalance(
      '"We should go now," she said. "The road is long." ' +
        "He grabbed his pack and thought about the miles ahead.",
    );
    expect(balance.totalWords).toBe(20);
    expect(balance.dialoguePercentage).toBeCloseTo(40, 5);
    expect(balance.actionPercentage).toBeCloseTo(5, 5);
    expect(balance.reflectionPercentage).toBeCloseTo(10, 5);
    expect(balance.balanceScore).toBeCloseTo(0.9, 5);
    expect(balance.recommendation).toBe("Good balance between action, dialogue, and reflection.");
  });

  it("recommends more dialogue for pure narrative", () => {
    const balance = analyzeActionBalance("The road stretched on for miles under a grey sky.");
    expect(balance.dialoguePercentage).toBe(0);
    expect(balance.recommendation).toBe("Consider adding more dialogue to break up narrative.");
  });
});

describe("analyzeEnding", () => {
  it("rates a hook-laden ending as strong", () => {
    const ending = analyzeEnding(
      "Could she escape before the door closed? But there was no time. What would happen next?",
    );
    expect(ending.endingStrength).toBe("strong");
    expect(ending.hasHook).toBe(true);
    expect(ending.hasQuestion).toBe(true);
    expect(ending.hasCliffhanger).toBe(true);
    expect(ending.hasUnresolvedConflict).toBe(true);
    expect(ending.hookScore).toBe(1);
  });

  it("rates a flat ending as weak", () => {
    const ending = analyzeEnding(
      "The sun set over the hills. They ate dinner. Everyone went to sleep.",
    );
    expect(ending.endingStrength).toBe("weak");
    expect(ending.hookScore).toBe(0);
  });

  it("rates a lone question as moderate", () => {
    const ending = analyzeEnding("What happens now?");
    expect(ending.endingStrength).toBe("moderate");
    expect(ending.hookScore).toBeCloseTo(0.5, 5);
  });

  it("limits stored ending text to 200 characters", () => {
    const ending = analyzeEnding(`${"word ".repeat(100)}end of the very long chapter.`);
    expect(ending.endingText.length).toBeLessThanOrEqual(200);
  });
});

describe("analyzePacing on a ~190-word prose fixture", () => {
  const report = analyzePacing(PACING_FIXTURE);

  it("computes plausible basic metrics", () => {
    expect(report.wordCount).toBeGreaterThanOrEqual(175);
    expect(report.wordCount).toBeLessThanOrEqual(205);
    expect(report.estimatedReadTimeMinutes).toBe(1);
  });

  it("finds the five scenes", () => {
    expect(report.sceneDistribution.totalScenes).toBe(5);
    expect(report.sceneDistribution.shortestScene).toBeGreaterThan(20);
    expect(report.sceneDistribution.longestScene).toBeLessThan(60);
  });

  it("traces a tension curve with a storm peak", () => {
    expect(report.tensionCurve.tensionPoints.length).toBeGreaterThanOrEqual(3);
    expect(report.tensionCurve.tensionPoints.length).toBeLessThanOrEqual(5);
    expect(report.tensionCurve.peakTension).toBeGreaterThanOrEqual(4);
    expect(report.tensionCurve.averageTension).toBeGreaterThanOrEqual(2);
    expect(report.tensionCurve.averageTension).toBeLessThanOrEqual(4.5);
    expect(report.tensionCurve.tensionVariance).toBeGreaterThan(0.3);
  });

  it("measures the action and reflection content", () => {
    expect(report.actionBalance.actionWords).toBeGreaterThanOrEqual(8);
    expect(report.actionBalance.actionPercentage).toBeGreaterThanOrEqual(3);
    expect(report.actionBalance.actionPercentage).toBeLessThanOrEqual(10);
    expect(report.actionBalance.reflectionWords).toBeGreaterThanOrEqual(2);
  });

  it("recognizes the strong hook ending", () => {
    expect(report.endingAnalysis.endingStrength).toBe("strong");
    expect(report.endingAnalysis.hasQuestion).toBe(true);
    expect(report.endingAnalysis.hookScore).toBeGreaterThanOrEqual(0.75);
  });

  it("produces a plausible overall pacing score and string recommendations", () => {
    expect(report.overallPacingScore).toBeGreaterThanOrEqual(60);
    expect(report.overallPacingScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(report.recommendations.every((r) => typeof r === "string")).toBe(true);
  });
});

describe("analyzePacing edge cases", () => {
  it("returns a zeroed report for empty text", () => {
    const report = analyzePacing("");
    expect(report.wordCount).toBe(0);
    expect(report.overallPacingScore).toBe(0);
    expect(report.recommendations).toEqual([]);
    expect(report.sceneDistribution.totalScenes).toBe(0);
    expect(report.endingAnalysis.endingStrength).toBe("moderate");
  });
});
