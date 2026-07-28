/**
 * Plot structure templates for book outline generation.
 *
 * This module provides structured templates for common narrative frameworks:
 * - Three-Act Structure
 * - Five-Act Structure (Freytag's Pyramid)
 * - Hero's Journey (12 stages)
 * - Seven-Point Story Structure
 * - Save the Cat Beat Sheet
 *
 * Ported from `_port/backend/plot_structures.py`. All beat descriptions,
 * percentages, and tips are preserved verbatim.
 */

/** Canonical structure types (the `structureType` field of a template). */
export type PlotStructureType =
  "three_act" | "five_act" | "heros_journey" | "seven_point" | "save_the_cat";

/** All registry keys accepted by lookups, including aliases. */
export type PlotStructureId = PlotStructureType | "freytags_pyramid";

/** Typical emotional arc labels used by beats. */
export type EmotionalArc =
  | "exposition"
  | "rising_action"
  | "tension_building"
  | "climax"
  | "falling_action"
  | "resolution"
  | "denouement";

/** A single beat/milestone in a plot structure. */
export interface PlotBeat {
  name: string;
  description: string;
  /** 0.0 to 1.0 */
  percentageThroughStory: number;
  /** As percentage of total chapters. */
  chapterRangeStart: number;
  chapterRangeEnd: number;
  typicalEmotionalArc: EmotionalArc;
  tips: readonly string[];
}

/** A complete plot structure template. */
export interface PlotTemplate {
  name: string;
  structureType: PlotStructureType;
  description: string;
  beats: readonly PlotBeat[];
  genreModifications: Readonly<Record<string, readonly string[]>>;
}

// =============================================================================
// THREE-ACT STRUCTURE
// =============================================================================

export const THREE_ACT_STRUCTURE: PlotTemplate = {
  name: "Three-Act Structure",
  structureType: "three_act",
  description:
    "Classic Hollywood structure dividing the story into Setup, Confrontation, and Resolution.",
  beats: [
    {
      name: "Act One (Setup)",
      description: "Introduce the protagonist, their world, and the central conflict.",
      percentageThroughStory: 0.0,
      chapterRangeStart: 0.0,
      chapterRangeEnd: 0.25,
      typicalEmotionalArc: "exposition",
      tips: [
        "Establish the protagonist's ordinary world",
        "Show what they want vs. what they need",
        "Plant seeds for later plot developments",
      ],
    },
    {
      name: "Inciting Incident",
      description:
        "The event that disrupts the protagonist's ordinary world and sets the story in motion.",
      percentageThroughStory: 0.12,
      chapterRangeStart: 0.1,
      chapterRangeEnd: 0.15,
      typicalEmotionalArc: "rising_action",
      tips: ["Make it clear and impactful", "Directly challenge the protagonist", "Create urgency"],
    },
    {
      name: "First Plot Point",
      description: "The protagonist commits to addressing the central conflict. No turning back.",
      percentageThroughStory: 0.25,
      chapterRangeStart: 0.22,
      chapterRangeEnd: 0.28,
      typicalEmotionalArc: "rising_action",
      tips: ["Raise the stakes", "Force a decision", "Move from reaction to action"],
    },
    {
      name: "Act Two (Confrontation)",
      description: "The protagonist faces escalating obstacles while pursuing their goal.",
      percentageThroughStory: 0.3,
      chapterRangeStart: 0.25,
      chapterRangeEnd: 0.75,
      typicalEmotionalArc: "tension_building",
      tips: [
        "Each obstacle should be harder than the last",
        "Deepen character relationships",
        "Reveal backstory through action",
      ],
    },
    {
      name: "Midpoint",
      description: "A major revelation or reversal that shifts the story's direction.",
      percentageThroughStory: 0.5,
      chapterRangeStart: 0.48,
      chapterRangeEnd: 0.52,
      typicalEmotionalArc: "climax",
      tips: [
        "Often a false victory or false defeat",
        "Raises stakes significantly",
        "Protagonist gains new information",
      ],
    },
    {
      name: "Second Plot Point",
      description: "All seems lost. The protagonist faces their darkest moment.",
      percentageThroughStory: 0.75,
      chapterRangeStart: 0.72,
      chapterRangeEnd: 0.78,
      typicalEmotionalArc: "falling_action",
      tips: [
        "Remove all safety nets",
        "Force protagonist to face their flaws",
        "Set up the final confrontation",
      ],
    },
    {
      name: "Act Three (Resolution)",
      description: "The protagonist confronts the antagonist and resolves the central conflict.",
      percentageThroughStory: 0.8,
      chapterRangeStart: 0.75,
      chapterRangeEnd: 1.0,
      typicalEmotionalArc: "resolution",
      tips: [
        "Pay off earlier setups",
        "Show character transformation",
        "Provide emotional satisfaction",
      ],
    },
    {
      name: "Climax",
      description: "The final confrontation where the central conflict is decided.",
      percentageThroughStory: 0.9,
      chapterRangeStart: 0.88,
      chapterRangeEnd: 0.95,
      typicalEmotionalArc: "climax",
      tips: [
        "Make it the highest stakes moment",
        "Protagonist must use what they've learned",
        "Resolution must feel earned",
      ],
    },
    {
      name: "Denouement",
      description: "The aftermath showing the new normal after the conflict is resolved.",
      percentageThroughStory: 0.95,
      chapterRangeStart: 0.95,
      chapterRangeEnd: 1.0,
      typicalEmotionalArc: "denouement",
      tips: ["Show how characters have changed", "Tie up loose ends", "Leave readers satisfied"],
    },
  ],
  genreModifications: {
    romance: [
      "Inciting incident should bring protagonists together",
      "Midpoint often includes first romantic commitment",
      "Dark moment often involves relationship threat",
    ],
    mystery: [
      "Inciting incident is typically the crime",
      "Midpoint reveals crucial clue",
      "Climax is the reveal/confrontation",
    ],
    thriller: [
      "Higher stakes from the beginning",
      "Multiple reversals in Act Two",
      "Climax should be visceral and immediate",
    ],
  },
};

// =============================================================================
// FIVE-ACT STRUCTURE (FREYTAG'S PYRAMID)
// =============================================================================

export const FIVE_ACT_STRUCTURE: PlotTemplate = {
  name: "Five-Act Structure (Freytag's Pyramid)",
  structureType: "five_act",
  description:
    "Classical dramatic structure with Exposition, Rising Action, Climax, Falling Action, and Catastrophe/Resolution.",
  beats: [
    {
      name: "Exposition",
      description: "Introduction of characters, setting, and initial situation.",
      percentageThroughStory: 0.0,
      chapterRangeStart: 0.0,
      chapterRangeEnd: 0.15,
      typicalEmotionalArc: "exposition",
      tips: [
        "Establish tone and genre",
        "Introduce key relationships",
        "Plant dramatic irony if applicable",
      ],
    },
    {
      name: "Exciting Force",
      description: "The event that sets the main conflict in motion.",
      percentageThroughStory: 0.15,
      chapterRangeStart: 0.12,
      chapterRangeEnd: 0.18,
      typicalEmotionalArc: "rising_action",
      tips: ["Clear cause and effect", "Protagonist must respond", "Sets trajectory for the story"],
    },
    {
      name: "Rising Action",
      description: "Complications and obstacles increase tension toward the climax.",
      percentageThroughStory: 0.2,
      chapterRangeStart: 0.15,
      chapterRangeEnd: 0.5,
      typicalEmotionalArc: "tension_building",
      tips: [
        "Each scene should raise stakes",
        "Develop subplots",
        "Build toward inevitable confrontation",
      ],
    },
    {
      name: "Climax",
      description: "The turning point - the moment of highest tension where fortune shifts.",
      percentageThroughStory: 0.5,
      chapterRangeStart: 0.48,
      chapterRangeEnd: 0.55,
      typicalEmotionalArc: "climax",
      tips: [
        "Maximum emotional impact",
        "Irreversible change occurs",
        "Point of no return for protagonist",
      ],
    },
    {
      name: "Falling Action",
      description: "Events unfold from the climax toward the resolution.",
      percentageThroughStory: 0.6,
      chapterRangeStart: 0.55,
      chapterRangeEnd: 0.85,
      typicalEmotionalArc: "falling_action",
      tips: [
        "Show consequences of climax",
        "Build toward final resolution",
        "Include moments of suspense",
      ],
    },
    {
      name: "Final Suspense",
      description: "A moment of uncertainty before the final resolution.",
      percentageThroughStory: 0.85,
      chapterRangeStart: 0.82,
      chapterRangeEnd: 0.9,
      typicalEmotionalArc: "tension_building",
      tips: [
        "Last obstacle or twist",
        "Tests protagonist's transformation",
        "Heightens emotional payoff",
      ],
    },
    {
      name: "Catastrophe/Resolution",
      description: "The final outcome - tragic or triumphant - and return to stability.",
      percentageThroughStory: 0.9,
      chapterRangeStart: 0.9,
      chapterRangeEnd: 1.0,
      typicalEmotionalArc: "resolution",
      tips: ["Fulfill genre expectations", "Complete character arcs", "Provide thematic closure"],
    },
  ],
  genreModifications: {},
};

// =============================================================================
// HERO'S JOURNEY (12 STAGES)
// =============================================================================

export const HEROS_JOURNEY: PlotTemplate = {
  name: "Hero's Journey",
  structureType: "heros_journey",
  description: "Joseph Campbell's monomyth structure following a hero's transformative adventure.",
  beats: [
    {
      name: "Ordinary World",
      description: "The hero's normal life before the adventure begins.",
      percentageThroughStory: 0.0,
      chapterRangeStart: 0.0,
      chapterRangeEnd: 0.08,
      typicalEmotionalArc: "exposition",
      tips: [
        "Show what the hero has to lose",
        "Establish their flaw or wound",
        "Create sympathy and relatability",
      ],
    },
    {
      name: "Call to Adventure",
      description: "The hero receives an invitation or challenge to leave their ordinary world.",
      percentageThroughStory: 0.08,
      chapterRangeStart: 0.06,
      chapterRangeEnd: 0.12,
      typicalEmotionalArc: "rising_action",
      tips: [
        "Make the call personal",
        "Show what's at stake",
        "Create intrigue about the special world",
      ],
    },
    {
      name: "Refusal of Call",
      description: "The hero initially resists the adventure due to fear or obligation.",
      percentageThroughStory: 0.12,
      chapterRangeStart: 0.1,
      chapterRangeEnd: 0.16,
      typicalEmotionalArc: "rising_action",
      tips: ["Show legitimate concerns", "Reveals character", "Builds anticipation"],
    },
    {
      name: "Meeting Mentor",
      description: "The hero encounters a guide who provides training, advice, or a gift.",
      percentageThroughStory: 0.16,
      chapterRangeStart: 0.14,
      chapterRangeEnd: 0.22,
      typicalEmotionalArc: "rising_action",
      tips: [
        "Mentor should have wisdom to share",
        "May give a protective talisman",
        "Prepares hero for challenges ahead",
      ],
    },
    {
      name: "Crossing Threshold",
      description: "The hero commits to the adventure and enters the special world.",
      percentageThroughStory: 0.22,
      chapterRangeStart: 0.2,
      chapterRangeEnd: 0.28,
      typicalEmotionalArc: "rising_action",
      tips: [
        "Clear demarcation from ordinary world",
        "No turning back",
        "Rules are different here",
      ],
    },
    {
      name: "Tests Allies Enemies",
      description: "The hero faces challenges and discovers who can be trusted.",
      percentageThroughStory: 0.35,
      chapterRangeStart: 0.28,
      chapterRangeEnd: 0.45,
      typicalEmotionalArc: "tension_building",
      tips: ["Introduce key allies", "Establish antagonist's power", "Hero learns new skills"],
    },
    {
      name: "Approach Innermost Cave",
      description: "The hero prepares for the major challenge in the special world.",
      percentageThroughStory: 0.5,
      chapterRangeStart: 0.45,
      chapterRangeEnd: 0.55,
      typicalEmotionalArc: "tension_building",
      tips: ["Build tension and dread", "Final preparations", "Team dynamics solidify"],
    },
    {
      name: "Ordeal",
      description: "The hero faces their greatest challenge and experiences death and rebirth.",
      percentageThroughStory: 0.6,
      chapterRangeStart: 0.55,
      chapterRangeEnd: 0.65,
      typicalEmotionalArc: "climax",
      tips: [
        "Near-death experience (literal or metaphorical)",
        "Confronts greatest fear",
        "Transformation occurs",
      ],
    },
    {
      name: "Reward",
      description: "The hero gains the treasure, knowledge, or reconciliation they sought.",
      percentageThroughStory: 0.68,
      chapterRangeStart: 0.65,
      chapterRangeEnd: 0.72,
      typicalEmotionalArc: "falling_action",
      tips: ["Celebrate the achievement", "But danger isn't over", "Hero has changed"],
    },
    {
      name: "Road Back",
      description: "The hero begins the journey back to the ordinary world.",
      percentageThroughStory: 0.75,
      chapterRangeStart: 0.72,
      chapterRangeEnd: 0.82,
      typicalEmotionalArc: "falling_action",
      tips: ["Chase or pursuit common", "Consequences catch up", "Must choose between worlds"],
    },
    {
      name: "Resurrection",
      description: "The final test where the hero must use everything learned.",
      percentageThroughStory: 0.88,
      chapterRangeStart: 0.82,
      chapterRangeEnd: 0.92,
      typicalEmotionalArc: "climax",
      tips: [
        "Climactic confrontation",
        "Hero proves transformation",
        "Old self dies, new self emerges",
      ],
    },
    {
      name: "Return with Elixir",
      description: "The hero returns home transformed, bearing gifts for the community.",
      percentageThroughStory: 0.95,
      chapterRangeStart: 0.92,
      chapterRangeEnd: 1.0,
      typicalEmotionalArc: "denouement",
      tips: [
        "Show how hero has changed",
        "Benefit to the community",
        "New equilibrium established",
      ],
    },
  ],
  genreModifications: {
    fantasy: [
      "Mentor often has magical abilities",
      "Special world has clear magical rules",
      "Elixir may be literal magical object",
    ],
    romance: [
      "The 'special world' is often the relationship",
      "Ordeal involves emotional vulnerability",
      "Elixir is love/commitment",
    ],
  },
};

// =============================================================================
// SEVEN-POINT STORY STRUCTURE
// =============================================================================

export const SEVEN_POINT_STRUCTURE: PlotTemplate = {
  name: "Seven-Point Story Structure",
  structureType: "seven_point",
  description:
    "Dan Wells' structure focusing on the protagonist's transformation through key plot points.",
  beats: [
    {
      name: "Hook",
      description:
        "Establish the protagonist's starting state - the opposite of where they'll end.",
      percentageThroughStory: 0.0,
      chapterRangeStart: 0.0,
      chapterRangeEnd: 0.1,
      typicalEmotionalArc: "exposition",
      tips: [
        "Show the character flaw or weakness",
        "Make readers care",
        "Set up the transformation to come",
      ],
    },
    {
      name: "Plot Turn 1",
      description: "The event that introduces the conflict and starts the story moving.",
      percentageThroughStory: 0.15,
      chapterRangeStart: 0.12,
      chapterRangeEnd: 0.2,
      typicalEmotionalArc: "rising_action",
      tips: ["Call to adventure", "New information changes everything", "Character must react"],
    },
    {
      name: "Pinch Point 1",
      description: "Apply pressure - show the antagonist's power and raise stakes.",
      percentageThroughStory: 0.35,
      chapterRangeStart: 0.3,
      chapterRangeEnd: 0.4,
      typicalEmotionalArc: "tension_building",
      tips: ["Villain demonstrates power", "Something bad happens", "Forces protagonist to act"],
    },
    {
      name: "Midpoint",
      description: "The protagonist shifts from reaction to action.",
      percentageThroughStory: 0.5,
      chapterRangeStart: 0.45,
      chapterRangeEnd: 0.55,
      typicalEmotionalArc: "rising_action",
      tips: [
        "Protagonist takes initiative",
        "Key realization or discovery",
        "Turns the story around",
      ],
    },
    {
      name: "Pinch Point 2",
      description: "More pressure - the antagonist strikes back, all seems lost.",
      percentageThroughStory: 0.7,
      chapterRangeStart: 0.65,
      chapterRangeEnd: 0.75,
      typicalEmotionalArc: "falling_action",
      tips: [
        "Antagonist's counter-attack",
        "Protagonist loses something important",
        "Dark night of the soul",
      ],
    },
    {
      name: "Plot Turn 2",
      description: "The final piece of the puzzle that enables the climax.",
      percentageThroughStory: 0.8,
      chapterRangeStart: 0.75,
      chapterRangeEnd: 0.85,
      typicalEmotionalArc: "rising_action",
      tips: [
        "Protagonist gains key knowledge or power",
        "Often comes from within",
        "Sets up the resolution",
      ],
    },
    {
      name: "Resolution",
      description: "The climax where the protagonist achieves their goal and completes their arc.",
      percentageThroughStory: 0.9,
      chapterRangeStart: 0.85,
      chapterRangeEnd: 1.0,
      typicalEmotionalArc: "resolution",
      tips: [
        "Mirror the hook - show transformation",
        "Protagonist uses everything they've learned",
        "Satisfying emotional payoff",
      ],
    },
  ],
  genreModifications: {},
};

// =============================================================================
// SAVE THE CAT BEAT SHEET
// =============================================================================

export const SAVE_THE_CAT: PlotTemplate = {
  name: "Save the Cat Beat Sheet",
  structureType: "save_the_cat",
  description: "Blake Snyder's screenwriting structure adapted for novels, with 15 specific beats.",
  beats: [
    {
      name: "Opening Image",
      description: "A visual that represents the protagonist's starting point.",
      percentageThroughStory: 0.0,
      chapterRangeStart: 0.0,
      chapterRangeEnd: 0.02,
      typicalEmotionalArc: "exposition",
      tips: ["Sets tone and mood", "Shows 'before' state", "Mirror with final image"],
    },
    {
      name: "Theme Stated",
      description:
        "Someone states the theme, often as advice the protagonist doesn't yet understand.",
      percentageThroughStory: 0.05,
      chapterRangeStart: 0.03,
      chapterRangeEnd: 0.07,
      typicalEmotionalArc: "exposition",
      tips: ["Can be subtle", "Often in dialogue", "Protagonist doesn't get it yet"],
    },
    {
      name: "Setup",
      description: "Establish the protagonist's world, flaws, and what needs to change.",
      percentageThroughStory: 0.08,
      chapterRangeStart: 0.02,
      chapterRangeEnd: 0.1,
      typicalEmotionalArc: "exposition",
      tips: [
        "'Save the Cat' moment here",
        "Show what's at stake",
        "Plant setups for later payoffs",
      ],
    },
    {
      name: "Catalyst",
      description: "The moment that sets the story in motion - life can't continue as before.",
      percentageThroughStory: 0.1,
      chapterRangeStart: 0.08,
      chapterRangeEnd: 0.12,
      typicalEmotionalArc: "rising_action",
      tips: ["Clear inciting incident", "Happens TO the protagonist", "Creates urgency"],
    },
    {
      name: "Debate",
      description: "The protagonist debates whether to embark on the journey.",
      percentageThroughStory: 0.15,
      chapterRangeStart: 0.12,
      chapterRangeEnd: 0.2,
      typicalEmotionalArc: "rising_action",
      tips: [
        "Internal and external debate",
        "Shows stakes of inaction",
        "Last chance to stay in status quo",
      ],
    },
    {
      name: "Break into Two",
      description: "The protagonist makes a choice and enters a new world.",
      percentageThroughStory: 0.2,
      chapterRangeStart: 0.18,
      chapterRangeEnd: 0.23,
      typicalEmotionalArc: "rising_action",
      tips: ["Proactive choice", "No turning back", "Upside-down version of ordinary world"],
    },
    {
      name: "B Story",
      description: "A subplot (often romantic) that carries the theme.",
      percentageThroughStory: 0.22,
      chapterRangeStart: 0.2,
      chapterRangeEnd: 0.25,
      typicalEmotionalArc: "rising_action",
      tips: [
        "New character(s) introduced",
        "Relationship develops theme",
        "Provides breather from A story",
      ],
    },
    {
      name: "Fun and Games",
      description: "The promise of the premise - what the audience came to see.",
      percentageThroughStory: 0.35,
      chapterRangeStart: 0.25,
      chapterRangeEnd: 0.45,
      typicalEmotionalArc: "rising_action",
      tips: [
        "Deliver genre expectations",
        "Protagonist explores new world",
        "Often has montage quality",
      ],
    },
    {
      name: "Midpoint",
      description: "Either a false victory or false defeat that raises the stakes.",
      percentageThroughStory: 0.5,
      chapterRangeStart: 0.45,
      chapterRangeEnd: 0.55,
      typicalEmotionalArc: "climax",
      tips: [
        "Stakes become life/death (literal or metaphorical)",
        "Time lock often starts",
        "Fun and games are over",
      ],
    },
    {
      name: "Bad Guys Close In",
      description: "External pressure mounts while internal doubts grow.",
      percentageThroughStory: 0.6,
      chapterRangeStart: 0.55,
      chapterRangeEnd: 0.7,
      typicalEmotionalArc: "tension_building",
      tips: ["Antagonist gains ground", "Team may fracture", "Protagonist's flaw causes problems"],
    },
    {
      name: "All Is Lost",
      description: "The lowest point - often involving a 'death' of some kind.",
      percentageThroughStory: 0.75,
      chapterRangeStart: 0.72,
      chapterRangeEnd: 0.78,
      typicalEmotionalArc: "falling_action",
      tips: ["'Whiff of death'", "Old self/way must die", "Mentor often 'dies' here"],
    },
    {
      name: "Dark Night of the Soul",
      description: "The protagonist processes the loss and finds new strength.",
      percentageThroughStory: 0.8,
      chapterRangeStart: 0.78,
      chapterRangeEnd: 0.85,
      typicalEmotionalArc: "falling_action",
      tips: ["Emotional processing", "Leads to breakthrough", "B story often provides key insight"],
    },
    {
      name: "Break into Three",
      description: "The protagonist has an epiphany and chooses to act.",
      percentageThroughStory: 0.85,
      chapterRangeStart: 0.82,
      chapterRangeEnd: 0.88,
      typicalEmotionalArc: "rising_action",
      tips: ["A and B stories merge", "Protagonist has changed", "New plan forms"],
    },
    {
      name: "Finale",
      description: "The protagonist confronts the antagonist and proves their transformation.",
      percentageThroughStory: 0.92,
      chapterRangeStart: 0.88,
      chapterRangeEnd: 0.97,
      typicalEmotionalArc: "climax",
      tips: ["Five-point finale structure", "Uses all learned skills", "High point of catharsis"],
    },
    {
      name: "Final Image",
      description: "A visual that represents the protagonist's ending point - mirror of opening.",
      percentageThroughStory: 0.98,
      chapterRangeStart: 0.97,
      chapterRangeEnd: 1.0,
      typicalEmotionalArc: "denouement",
      tips: ["Shows transformation complete", "Mirrors opening image", "Provides closure"],
    },
  ],
  genreModifications: {},
};

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

export const PLOT_TEMPLATES: Record<PlotStructureId, PlotTemplate> = {
  three_act: THREE_ACT_STRUCTURE,
  five_act: FIVE_ACT_STRUCTURE,
  heros_journey: HEROS_JOURNEY,
  seven_point: SEVEN_POINT_STRUCTURE,
  save_the_cat: SAVE_THE_CAT,
  freytags_pyramid: FIVE_ACT_STRUCTURE, // Alias
};

/** All registry keys, including the `freytags_pyramid` alias. */
export const PLOT_STRUCTURE_IDS = [
  "three_act",
  "five_act",
  "heros_journey",
  "seven_point",
  "save_the_cat",
  "freytags_pyramid",
] as const satisfies readonly PlotStructureId[];

/** Get a plot template by its structure type (or alias). */
export function getPlotTemplate(structureType: string): PlotTemplate | undefined {
  return (PLOT_TEMPLATES as Record<string, PlotTemplate>)[structureType];
}

/** Get list of all available template names (registry keys). */
export function getAllTemplateNames(): PlotStructureId[] {
  return [...PLOT_STRUCTURE_IDS];
}

export interface PlotTemplateSummary {
  name: string;
  structureType: PlotStructureType;
  description: string;
  beatCount: number;
  beats: { name: string; description: string; percentage: number }[];
}

/** Get a summary of a plot template for display. */
export function getTemplateSummary(structureType: string): PlotTemplateSummary | undefined {
  const template = getPlotTemplate(structureType);
  if (!template) return undefined;

  return {
    name: template.name,
    structureType: template.structureType,
    description: template.description,
    beatCount: template.beats.length,
    beats: template.beats.map((beat) => ({
      name: beat.name,
      description: beat.description,
      percentage: beat.percentageThroughStory,
    })),
  };
}

/** Assign chapters to each beat based on total chapter count. */
export function chapterAssignments(
  structureType: string,
  totalChapters: number,
): Record<string, number[]> | undefined {
  const template = getPlotTemplate(structureType);
  if (!template) return undefined;

  const assignments: Record<string, number[]> = {};
  for (const beat of template.beats) {
    const startCh = Math.max(1, Math.trunc(beat.chapterRangeStart * totalChapters) + 1);
    const endCh = Math.min(totalChapters, Math.trunc(beat.chapterRangeEnd * totalChapters) + 1);
    const chapters: number[] = [];
    for (let ch = startCh; ch <= endCh; ch++) chapters.push(ch);
    assignments[beat.name] = chapters;
  }
  return assignments;
}

export interface ChapterGuidance {
  chapterNumber: number;
  percentageThroughStory: number;
  currentBeat: {
    name: string;
    description: string;
    emotionalArc: EmotionalArc;
    tips: readonly string[];
  };
  structureContext: string;
  nextBeat?: {
    name: string;
    description: string;
    chaptersUntil: number;
  };
}

/**
 * Generate writing guidance for a specific chapter based on plot structure.
 * Returns `undefined` for an unknown structure type.
 */
export function chapterGuidance(
  structure: string,
  chapterNumber: number,
  totalChapters: number,
): ChapterGuidance | undefined {
  const template = getPlotTemplate(structure);
  if (!template) return undefined;

  // Calculate percentage through the story
  const percentage = (chapterNumber - 1) / Math.max(1, totalChapters - 1);

  // Find the current beat
  let currentBeat: PlotBeat | undefined;
  let nextBeat: PlotBeat | undefined;

  for (let i = 0; i < template.beats.length; i++) {
    const beat = template.beats[i];
    if (beat.chapterRangeStart <= percentage && percentage <= beat.chapterRangeEnd) {
      currentBeat = beat;
      if (i + 1 < template.beats.length) {
        nextBeat = template.beats[i + 1];
      }
      break;
    }
  }

  if (!currentBeat) {
    // Find the closest beat
    for (const beat of template.beats) {
      if (percentage <= beat.percentageThroughStory) {
        currentBeat = beat;
        break;
      }
    }
    if (!currentBeat) {
      currentBeat = template.beats[template.beats.length - 1];
    }
  }

  const guidance: ChapterGuidance = {
    chapterNumber,
    percentageThroughStory: percentage,
    currentBeat: {
      name: currentBeat.name,
      description: currentBeat.description,
      emotionalArc: currentBeat.typicalEmotionalArc,
      tips: currentBeat.tips,
    },
    structureContext: template.description,
  };

  if (nextBeat) {
    guidance.nextBeat = {
      name: nextBeat.name,
      description: nextBeat.description,
      chaptersUntil: Math.trunc(nextBeat.chapterRangeStart * totalChapters) - chapterNumber + 1,
    };
  }

  return guidance;
}

/**
 * Suggest the emotional arc for a chapter based on plot structure.
 * Defaults to "rising_action" when the structure is unknown or no beat
 * covers the chapter's position.
 */
export function suggestEmotionalArc(
  structure: string,
  chapterNumber: number,
  totalChapters: number,
): EmotionalArc {
  const template = getPlotTemplate(structure);
  if (!template) return "rising_action";

  const percentage = (chapterNumber - 1) / Math.max(1, totalChapters - 1);

  for (const beat of template.beats) {
    if (beat.chapterRangeStart <= percentage && percentage <= beat.chapterRangeEnd) {
      return beat.typicalEmotionalArc;
    }
  }

  return "rising_action";
}
