/**
 * Genre-specific outline prompts and templates.
 *
 * This module provides genre-aware customization for outline generation:
 * - Romance: Meet-cute, conflict, resolution patterns
 * - Mystery: Clue placement, red herrings, revelation timing
 * - Fantasy: World-building integration, magic system rules
 * - Thriller: Pacing, tension escalation, twist placement
 * - Literary Fiction: Character development focus, thematic depth
 * - Science Fiction: Speculative premise and its implications
 * - Horror: Escalating dread, atmosphere, vulnerable protagonists
 *
 * Ported from `_port/backend/genre_templates.py`. All descriptions, guidance,
 * tips, tropes, avoid lists, and reader expectations are preserved verbatim.
 *
 * Five further genres — historical fiction, young adult, middle grade,
 * children's, and memoir — live in `./genres-extended` and are registered here.
 * They import only types from this module, so there is no runtime cycle.
 */

import {
  CHILDRENS_TEMPLATE,
  HISTORICAL_FICTION_TEMPLATE,
  MEMOIR_TEMPLATE,
  MIDDLE_GRADE_TEMPLATE,
  YOUNG_ADULT_TEMPLATE,
} from "./genres-extended";

/** Canonical genre identifiers. */
export type GenreId =
  | "romance"
  | "mystery"
  | "fantasy"
  | "thriller"
  | "literary_fiction"
  | "science_fiction"
  | "horror"
  | "historical_fiction"
  | "young_adult"
  | "middle_grade"
  | "childrens"
  | "memoir";

/**
 * Reader age band. Drives chapter-length defaults and the content guardrails
 * that must hold regardless of the author's own settings — a children's book
 * never carries adult heat or graphic violence, whatever the project says.
 */
export type GenreAudience = "adult" | "young_adult" | "middle_grade" | "children";

/** Chapter positions used for genre-specific chapter guidance. */
export type ChapterPosition = "opening" | "early" | "midpoint" | "late" | "climax" | "ending";

/** A required or recommended element for a genre. */
export interface GenreElement {
  name: string;
  description: string;
  /** e.g., "early", "midpoint", "climax", "throughout" */
  whenToInclude: string;
  /** true = must include; false = recommended but not mandatory. */
  required: boolean;
  tips: readonly string[];
}

/** Complete genre template with prompts and requirements. */
export interface GenreTemplate {
  /** Display name, e.g. "Literary Fiction". */
  genre: string;
  description: string;
  /**
   * Reader age band. Absent means adult, which is what every one of the
   * original seven templates is — so omitting it keeps them unchanged.
   */
  audience?: GenreAudience;
  /**
   * True for forms with no invented cast and no plotted arc. The outline and
   * Story Bible layers branch on this: a memoir has real people and a driving
   * question, not characters and a three-act structure.
   */
  nonFiction?: boolean;
  /** Suggested chapter count when the author has not chosen one. */
  defaultChapters?: number;
  /**
   * Suggested words per chapter. A children's chapter is a fraction of an adult
   * one, and defaulting them to the same 3,000 words produces an unreadable book.
   */
  defaultWordsPerChapter?: number;
  coreElements: readonly GenreElement[];
  chapterGuidance: Readonly<Record<ChapterPosition, string>>;
  toneRecommendations: readonly string[];
  pacingNotes: string;
  commonTropes: readonly string[];
  avoidList: readonly string[];
  readerExpectations: readonly string[];
  subgenres: readonly string[];
}

// =============================================================================
// ROMANCE GENRE TEMPLATE
// =============================================================================

export const ROMANCE_TEMPLATE: GenreTemplate = {
  genre: "Romance",
  description:
    "Stories centered on a romantic relationship with an emotionally satisfying and optimistic ending (HEA/HFN).",
  coreElements: [
    {
      name: "Meet-Cute",
      description: "The first meeting between the romantic leads, often memorable or unusual.",
      whenToInclude: "First 10-15% of story",
      required: true,
      tips: [
        "Make it memorable and specific to your characters",
        "Show initial chemistry or tension",
        "Plant seeds for their connection",
      ],
    },
    {
      name: "Central Conflict",
      description: "The obstacle(s) keeping the couple apart - internal, external, or both.",
      whenToInclude: "Introduced early, escalates throughout",
      required: true,
      tips: [
        "Must be believable but not insurmountable",
        "Internal conflicts (fear of intimacy) are often stronger than external",
        "Avoid easily solvable misunderstandings",
      ],
    },
    {
      name: "First Kiss/Moment of Intimacy",
      description: "A significant romantic milestone showing deepening connection.",
      whenToInclude: "Around 30-40% mark",
      required: true,
      tips: [
        "Build anticipation beforehand",
        "Make it emotionally significant, not just physical",
        "Often followed by a setback",
      ],
    },
    {
      name: "Black Moment",
      description: "The point where all seems lost for the relationship.",
      whenToInclude: "Around 75-85% mark",
      required: true,
      tips: [
        "Should feel devastating but not contrived",
        "Often triggers character growth",
        "The moment readers fear they won't get together",
      ],
    },
    {
      name: "Grand Gesture/Declaration",
      description: "A significant action or confession that proves love.",
      whenToInclude: "Near the climax",
      required: true,
      tips: [
        "Should demonstrate character growth",
        "Must address the central conflict",
        "Public or private depending on characters",
      ],
    },
    {
      name: "HEA/HFN Ending",
      description: "Happily Ever After or Happy For Now - the couple ends together.",
      whenToInclude: "Final chapter(s)",
      required: true,
      tips: [
        "Must feel earned through the story",
        "Show the couple's future together",
        "Tie up emotional threads",
      ],
    },
    {
      name: "Emotional Beats",
      description: "Regular moments showing the relationship's emotional progression.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Balance sweet and tension",
        "Show vulnerability from both leads",
        "Use internal monologue effectively",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Establish both characters' lives before they meet. Show what they're missing or what their flaw is. Make readers root for them to find love.",
    early:
      "The meet-cute should be memorable. Show initial attraction but also the conflict that will keep them apart. Build romantic tension.",
    midpoint:
      "First major romantic milestone (first kiss, first intimacy). Often followed by a complication that tests the relationship.",
    late: "Escalate the central conflict. The relationship is threatened. Both characters must confront their fears.",
    climax:
      "The black moment - all seems lost. Then the grand gesture or declaration that proves love conquers the obstacle.",
    ending:
      "The HEA/HFN. Show the couple together, addressing any lingering doubts. Leave readers satisfied with the emotional payoff.",
  },
  toneRecommendations: [
    "Balance humor with emotional depth",
    "Allow both leads to be vulnerable",
    "Build sexual/romantic tension through delayed gratification",
    "Use internal monologue to show attraction",
  ],
  pacingNotes:
    "Romance requires careful pacing of the relationship development. Too fast feels unbelievable; too slow tests patience. Major romantic beats should occur at roughly 25%, 50%, and 75% marks with the HEA at the end.",
  commonTropes: [
    "Enemies to lovers",
    "Friends to lovers",
    "Second chance romance",
    "Fake relationship",
    "Forced proximity",
    "Opposites attract",
    "Secret identity",
    "Forbidden love",
  ],
  avoidList: [
    "Love triangles that don't resolve cleanly",
    "Misunderstandings that could be solved by a simple conversation",
    "Rushing the emotional development",
    "Ambiguous endings about the relationship",
    "One-sided grand gestures without consent",
  ],
  readerExpectations: [
    "The central relationship is the main plot, not a subplot",
    "Both leads are equally developed and important",
    "The ending is optimistic and emotionally satisfying",
    "Chemistry is palpable between the leads",
    "The obstacles to love are meaningful and overcome",
  ],
  subgenres: [
    "Contemporary Romance",
    "Historical Romance",
    "Paranormal Romance",
    "Romantic Suspense",
    "Romantic Comedy",
    "New Adult Romance",
  ],
};

// =============================================================================
// MYSTERY GENRE TEMPLATE
// =============================================================================

export const MYSTERY_TEMPLATE: GenreTemplate = {
  genre: "Mystery",
  description:
    "Stories centered on solving a crime or puzzle, with clues for readers to follow along.",
  coreElements: [
    {
      name: "The Crime/Puzzle",
      description:
        "The central mystery that drives the plot - usually murder, theft, or disappearance.",
      whenToInclude: "Opening or inciting incident",
      required: true,
      tips: [
        "Make the stakes clear and compelling",
        "Give the detective a personal stake if possible",
        "The mystery should seem impossible to solve at first",
      ],
    },
    {
      name: "The Detective/Protagonist",
      description: "The character who will solve the mystery - professional or amateur.",
      whenToInclude: "Established from the start",
      required: true,
      tips: [
        "Give them unique skills and flaws",
        "Their methodology should be consistent",
        "Personal stakes increase engagement",
      ],
    },
    {
      name: "Clue Placement",
      description:
        "Fair clues scattered throughout that allow readers to potentially solve the mystery.",
      whenToInclude: "Throughout, with major clues at key beats",
      required: true,
      tips: [
        "Plant at least 3-5 genuine clues",
        "Hide clues in plain sight through misdirection",
        "Each clue should have a 'reveal' moment",
      ],
    },
    {
      name: "Red Herrings",
      description: "False clues or suspects that mislead but play fair with the reader.",
      whenToInclude: "Sprinkled throughout, resolved before finale",
      required: true,
      tips: [
        "Red herrings should seem plausible",
        "Eventually explain why they're not the solution",
        "Don't make them too obvious or frustrating",
      ],
    },
    {
      name: "Suspect Pool",
      description: "A cast of characters with means, motive, and opportunity.",
      whenToInclude: "Introduced in first third",
      required: true,
      tips: [
        "Each suspect should be plausible",
        "Give each suspect secrets (most unrelated to the crime)",
        "The real culprit should be introduced early",
      ],
    },
    {
      name: "The Revelation",
      description: "The moment when the solution becomes clear, often in a dramatic scene.",
      whenToInclude: "Climax of the story",
      required: true,
      tips: [
        "Connect all the planted clues",
        "The solution should be surprising but inevitable in hindsight",
        "Give the detective a moment of triumph",
      ],
    },
    {
      name: "Resolution/Denouement",
      description: "The aftermath showing justice served and loose ends tied.",
      whenToInclude: "Final chapter(s)",
      required: true,
      tips: [
        "Explain the culprit's motivation fully",
        "Address all red herrings and subplots",
        "Provide emotional closure for affected characters",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Establish the setting and detective character. The crime should occur or be discovered within the first 1-2 chapters. Hook readers with an intriguing puzzle.",
    early:
      "Introduce the suspect pool. Begin investigation. Plant initial clues and red herrings. Each suspect should have suspicious behavior.",
    midpoint:
      "A major revelation changes the direction of the investigation. Perhaps a key suspect is eliminated or a new piece of evidence emerges. The detective may feel they're getting closer or farther from the truth.",
    late: "The tension mounts. More clues are revealed. The detective may be in danger. The final pieces are coming together but the solution isn't clear yet.",
    climax:
      "The revelation scene. The detective gathers suspects or confronts the culprit. All clues connect. The mystery is solved in a satisfying 'aha' moment.",
    ending:
      "Justice is served (or deliberately isn't, in noir). Explain the full story. Show the impact on all characters. Provide closure.",
  },
  toneRecommendations: [
    "Maintain tension and suspicion throughout",
    "Use chapter endings as mini-cliffhangers",
    "Balance procedural details with character development",
    "Create atmosphere through setting details",
  ],
  pacingNotes:
    "Mysteries require careful revelation of information. Too fast and readers can't engage with solving it; too slow and they lose interest. Major clues should appear at roughly 25%, 50%, and 75% marks with the solution at the climax.",
  commonTropes: [
    "Locked room mystery",
    "Amateur sleuth",
    "Police procedural",
    "Cozy mystery",
    "Hard-boiled detective",
    "Cold case",
    "Whodunit",
    "Howdunit",
  ],
  avoidList: [
    "Solutions that rely on information never given to readers",
    "Culprits introduced at the last minute",
    "Deus ex machina revelations",
    "Making the mystery too easy to solve",
    "Red herrings that feel like cheating",
    "The detective knowing things they couldn't know",
  ],
  readerExpectations: [
    "Fair play - all clues should be available to readers",
    "A satisfying solution that makes sense in hindsight",
    "An engaging detective character",
    "Enough suspects to consider multiple theories",
    "Justice (in some form) at the end",
  ],
  subgenres: [
    "Cozy Mystery",
    "Police Procedural",
    "Hard-boiled/Noir",
    "Amateur Sleuth",
    "Legal Thriller",
    "Historical Mystery",
  ],
};

// =============================================================================
// FANTASY GENRE TEMPLATE
// =============================================================================

export const FANTASY_TEMPLATE: GenreTemplate = {
  genre: "Fantasy",
  description:
    "Stories set in imaginary worlds with supernatural elements like magic, mythical creatures, or alternate realities.",
  coreElements: [
    {
      name: "World Building",
      description: "A distinct, consistent world with its own rules, cultures, and history.",
      whenToInclude: "Established early, revealed throughout",
      required: true,
      tips: [
        "Show don't tell - reveal through character interaction",
        "Create rules and stick to them consistently",
        "The world should affect the plot directly",
      ],
    },
    {
      name: "Magic System",
      description: "Supernatural elements with defined rules, costs, and limitations.",
      whenToInclude: "Established early, demonstrated throughout",
      required: true,
      tips: [
        "Hard magic: clear rules that readers understand",
        "Soft magic: mysterious but consistent",
        "Magic should have costs/limitations",
      ],
    },
    {
      name: "Quest/Journey",
      description: "A clear goal that drives the protagonist through the fantasy world.",
      whenToInclude: "Established by 15-20% mark",
      required: true,
      tips: [
        "The quest should force exploration of the world",
        "Stakes should be both personal and world-scale",
        "Progress should be measurable",
      ],
    },
    {
      name: "Chosen One/Special Status",
      description: "The protagonist has a unique role, ability, or destiny.",
      whenToInclude: "Revealed early to midpoint",
      required: false,
      tips: [
        "If subverting this trope, do so deliberately",
        "The special status should create burden, not just power",
        "Earn the destiny through character choices",
      ],
    },
    {
      name: "Fantastical Creatures/Races",
      description: "Non-human characters or creatures that inhabit the world.",
      whenToInclude: "Throughout as appropriate",
      required: false,
      tips: [
        "Give each race/creature unique culture and traits",
        "Avoid pure evil races without nuance",
        "Use creatures to reflect themes",
      ],
    },
    {
      name: "Epic Conflict",
      description: "A struggle with far-reaching consequences, often good vs. evil.",
      whenToInclude: "Established early, culminates in climax",
      required: true,
      tips: [
        "Make the stakes clear and meaningful",
        "Show what will be lost if the protagonist fails",
        "The antagonist should have comprehensible motivation",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Ground readers in the familiar before introducing the fantastical. Establish the protagonist's ordinary world, then disrupt it. Begin world-building through small, telling details.",
    early:
      "Introduce the magic system through demonstration, not exposition. The quest/goal should become clear. Start building the fantastical world piece by piece.",
    midpoint:
      "A major revelation about the world, magic, or the protagonist's role. The true scope of the conflict becomes clear. The protagonist may gain new powers or face their first major defeat.",
    late: "The final preparation for the climactic confrontation. Alliances are tested. The cost of the magic/quest should be apparent. The world's fate hangs in the balance.",
    climax:
      "The epic confrontation. Magic, world-building, and character growth all come together. The protagonist uses everything they've learned. The world changes as a result.",
    ending:
      "Show the new state of the world. Address the cost of victory. The protagonist's transformation is complete. Leave room for wonder.",
  },
  toneRecommendations: [
    "Balance wonder with grounded emotion",
    "Make the fantastical elements matter to the plot",
    "Ground high concepts in relatable human emotions",
    "Use sensory details to make magic tangible",
  ],
  pacingNotes:
    "Fantasy can support longer story lengths but must maintain momentum. World-building should enhance, not slow, the narrative. Action sequences should showcase the magic system. Allow quiet moments for character development.",
  commonTropes: [
    "Chosen One",
    "Dark Lord antagonist",
    "Magic school",
    "Lost heir",
    "Portal fantasy",
    "Epic quest",
    "Mentor figure",
    "Ancient prophecy",
  ],
  avoidList: [
    "Info-dumping world-building exposition",
    "Magic that solves problems too easily (deus ex machina)",
    "Inconsistent magic rules",
    "Evil races with no nuance",
    "Incomprehensible fantasy names in excess",
    "Forgetting real-world physics when convenient",
  ],
  readerExpectations: [
    "A fully realized world that feels lived-in",
    "Magic that follows consistent rules",
    "Epic stakes and conflicts",
    "A sense of wonder and discovery",
    "A protagonist who grows through their journey",
  ],
  subgenres: [
    "Epic/High Fantasy",
    "Urban Fantasy",
    "Dark Fantasy",
    "Portal Fantasy",
    "Sword and Sorcery",
    "Romantic Fantasy",
  ],
};

// =============================================================================
// THRILLER GENRE TEMPLATE
// =============================================================================

export const THRILLER_TEMPLATE: GenreTemplate = {
  genre: "Thriller",
  description:
    "Fast-paced stories with high stakes, danger, and constant tension. The protagonist often races against time or a powerful antagonist.",
  coreElements: [
    {
      name: "High Stakes",
      description: "Life-or-death consequences that affect the protagonist or larger groups.",
      whenToInclude: "Established from the start, escalating throughout",
      required: true,
      tips: [
        "Make the stakes personal AND larger",
        "Raise stakes at each act break",
        "Show consequences of failure",
      ],
    },
    {
      name: "Time Pressure",
      description: "A ticking clock that creates urgency throughout the story.",
      whenToInclude: "Introduced early, constant presence",
      required: true,
      tips: [
        "The clock should feel real and consequential",
        "Remind readers of the deadline regularly",
        "Time running out should increase tension naturally",
      ],
    },
    {
      name: "Formidable Antagonist",
      description: "An opponent who is competent, dangerous, and always one step ahead.",
      whenToInclude: "Presence felt from start, direct confrontation late",
      required: true,
      tips: [
        "The antagonist should feel like a real threat",
        "Give them resources and intelligence",
        "Their plan should be comprehensible even if evil",
      ],
    },
    {
      name: "Twists and Reversals",
      description:
        "Unexpected developments that change the protagonist's understanding or situation.",
      whenToInclude: "Placed at key beats (25%, 50%, 75%)",
      required: true,
      tips: [
        "Set up twists with subtle foreshadowing",
        "Each twist should raise stakes, not just surprise",
        "The final twist should reframe the entire story",
      ],
    },
    {
      name: "Protagonist Under Threat",
      description: "The main character is in constant physical or psychological danger.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Vary the types of threats",
        "Use close calls to build tension",
        "The protagonist should earn their survival",
      ],
    },
    {
      name: "Tension Escalation",
      description: "Each chapter should increase the tension and stakes.",
      whenToInclude: "Throughout, building to climax",
      required: true,
      tips: [
        "No chapter should feel like a plateau",
        "Use chapter endings as cliffhangers",
        "Brief respites make the tension more effective",
      ],
    },
    {
      name: "Climactic Confrontation",
      description: "A final showdown with the antagonist where everything is on the line.",
      whenToInclude: "Near the end, after maximum tension",
      required: true,
      tips: [
        "The protagonist should use all they've learned",
        "The antagonist should be at their most dangerous",
        "The outcome should feel earned, not lucky",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Start in media res or with an immediate hook. Establish the threat and stakes quickly. The protagonist should be capable but in over their head.",
    early:
      "The antagonist's plan begins to unfold. The protagonist is reactive. Plant clues for later twists. Each chapter should end on tension.",
    midpoint:
      "A major twist or reversal. The protagonist shifts from reactive to proactive. New understanding of the threat. Stakes become personal as well as external.",
    late: "The antagonist closes in. Time is running out. Trust is tested. The protagonist may lose allies or resources. The final confrontation approaches.",
    climax:
      "The ultimate confrontation. Everything converges. The protagonist must make a crucial choice. Maximum action and tension. The twist that reframes everything may come here.",
    ending:
      "Resolution of the threat. Brief cooldown showing the cost. The protagonist is changed. Possible setup for sequel or open question.",
  },
  toneRecommendations: [
    "Maintain relentless pace",
    "Short chapters and sentences during action",
    "Use multiple POVs to show the antagonist's moves",
    "Create dread through what characters don't know",
  ],
  pacingNotes:
    "Thrillers demand constant forward momentum. Every scene should either advance the plot or increase tension. Long exposition or character reflection should be minimal. Use short chapters to maintain urgency. The pace should accelerate toward the climax.",
  commonTropes: [
    "Ticking clock",
    "Conspiracy",
    "Wrongly accused",
    "Cat and mouse",
    "The one that got away",
    "Inside job",
    "Race against time",
    "Trust no one",
  ],
  avoidList: [
    "Long passages without tension",
    "Easily escapable traps",
    "Incompetent antagonists",
    "Twists that don't make sense in hindsight",
    "Protagonist winning through luck alone",
    "Excessive exposition during action",
  ],
  readerExpectations: [
    "Constant tension and suspense",
    "A protagonist who is tested to their limits",
    "A worthy, intelligent antagonist",
    "Surprising but logical plot developments",
    "A satisfying, high-stakes climax",
  ],
  subgenres: [
    "Psychological Thriller",
    "Legal Thriller",
    "Medical Thriller",
    "Spy Thriller",
    "Political Thriller",
    "Techno-thriller",
  ],
};

// =============================================================================
// LITERARY FICTION TEMPLATE
// =============================================================================

export const LITERARY_FICTION_TEMPLATE: GenreTemplate = {
  genre: "Literary Fiction",
  description:
    "Character-driven stories that emphasize prose style, thematic depth, and the human condition over plot mechanics.",
  coreElements: [
    {
      name: "Complex Protagonist",
      description: "A deeply developed main character with rich inner life and contradictions.",
      whenToInclude: "Established from the start, deepened throughout",
      required: true,
      tips: [
        "Interior life is as important as external action",
        "Contradictions and flaws make characters real",
        "The character's transformation is the plot",
      ],
    },
    {
      name: "Thematic Depth",
      description: "Exploration of universal themes through specific characters and situations.",
      whenToInclude: "Woven throughout",
      required: true,
      tips: [
        "Theme should emerge from character and situation",
        "Avoid being didactic or heavy-handed",
        "Multiple layers of meaning enhance rereading",
      ],
    },
    {
      name: "Prose Style",
      description:
        "Distinctive, crafted prose that serves the story's emotional and thematic goals.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "The prose style should match the content",
        "Every word should be intentional",
        "Rhythm, imagery, and language all carry meaning",
      ],
    },
    {
      name: "Moral Ambiguity",
      description: "Situations and characters that resist simple judgments of right and wrong.",
      whenToInclude: "Throughout",
      required: false,
      tips: [
        "Avoid clear heroes and villains",
        "Let readers draw their own conclusions",
        "Complexity reflects real life",
      ],
    },
    {
      name: "Emotional Truth",
      description: "Authentic representation of human emotion and experience.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Specificity creates universality",
        "Show vulnerability and contradiction",
        "Quiet moments can be as powerful as dramatic ones",
      ],
    },
    {
      name: "Character Transformation",
      description:
        "Meaningful change in the protagonist's understanding, beliefs, or way of being.",
      whenToInclude: "Gradual throughout, culminating near end",
      required: true,
      tips: [
        "Transformation can be subtle",
        "The change should feel earned through the narrative",
        "Not all transformations are positive",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Establish voice and tone immediately. Introduce the protagonist in a moment that reveals character. Ground the story in specific, vivid detail. The central tension may be internal.",
    early:
      "Develop the protagonist's world and relationships. Explore the thematic questions through situation and character. The 'plot' may be subtle - focus on emotional truth.",
    midpoint:
      "A shift in the protagonist's understanding or circumstances. This may be quiet rather than dramatic. The thematic questions deepen. Relationships evolve.",
    late: "The central tensions come to a head. The protagonist must confront what they've been avoiding. The complexity of the situation is fully revealed.",
    climax:
      "The moment of decision or realization. This may be an internal climax rather than external action. The thematic threads converge. The protagonist's transformation crystallizes.",
    ending:
      "Resolution may be ambiguous or open-ended. The change in the protagonist is visible. Echo earlier moments with new meaning. Leave readers with something to contemplate.",
  },
  toneRecommendations: [
    "Trust the reader's intelligence",
    "Show rather than tell, but with purpose",
    "Allow silence and space in the narrative",
    "Subtext is as important as text",
  ],
  pacingNotes:
    "Literary fiction often moves at a more contemplative pace than genre fiction. This doesn't mean slow - every scene should serve a purpose. The pacing should match the emotional journey. Quiet moments can be as intense as action.",
  commonTropes: [
    "Coming of age",
    "Family drama",
    "Identity exploration",
    "Loss and grief",
    "Social commentary",
    "Memory and nostalgia",
    "Relationship examination",
    "Ordinary life illuminated",
  ],
  avoidList: [
    "Plot-driven events that feel artificial",
    "Characters as mouthpieces for themes",
    "Purple prose that overwhelms story",
    "Endings that tie everything up neatly",
    "Villains or heroes without complexity",
    "Heavy-handed symbolism",
  ],
  readerExpectations: [
    "Beautiful, purposeful prose",
    "Deep character exploration",
    "Themes that resonate beyond the page",
    "Emotional authenticity",
    "A thoughtful reading experience",
  ],
  subgenres: [
    "Contemporary Fiction",
    "Historical Literary Fiction",
    "Magical Realism",
    "Experimental Fiction",
    "Biographical Fiction",
    "Social Fiction",
  ],
};

// =============================================================================
// SCIENCE FICTION TEMPLATE (BONUS)
// =============================================================================

export const SCIENCE_FICTION_TEMPLATE: GenreTemplate = {
  genre: "Science Fiction",
  description:
    "Stories that extrapolate from current or imagined science and technology to explore their impact on humanity and society.",
  coreElements: [
    {
      name: "Speculative Element",
      description: "A 'what if' premise rooted in science or technology.",
      whenToInclude: "Central to the story from the start",
      required: true,
      tips: [
        "The speculation should be the story's engine",
        "Ground fantastical elements in plausible science",
        "Explore implications thoroughly",
      ],
    },
    {
      name: "World-Building",
      description: "A future or alternate world shaped by the speculative element.",
      whenToInclude: "Established early, revealed throughout",
      required: true,
      tips: [
        "Show how society has adapted to the technology",
        "Include both benefits and drawbacks",
        "Small details make the world feel real",
      ],
    },
    {
      name: "Thematic Exploration",
      description: "Use the speculative element to explore real-world themes and questions.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "What does this technology reveal about human nature?",
        "Explore ethical implications",
        "The best SF illuminates the present through the future",
      ],
    },
    {
      name: "Technology Impact",
      description: "Show how the science/technology affects individual lives and society.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Both positive and negative consequences",
        "Technology should create new problems as it solves others",
        "Personal stories illuminate broader themes",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Establish the speculative premise quickly. Show how it affects daily life. Ground readers in the rules of this world through action, not exposition.",
    early:
      "Develop the implications of the premise. The protagonist encounters the central conflict that the technology creates or enables. World-building through character interaction.",
    midpoint:
      "A major revelation about the technology, society, or protagonist changes the stakes. The full scope of the speculation becomes clear.",
    late: "The consequences of the speculation come to a head. The protagonist must make choices that embody the thematic questions. Technology's double-edged nature is apparent.",
    climax:
      "The thematic and plot threads converge. The protagonist confronts the implications of the speculative element. The climax should illuminate the central 'what if.'",
    ending:
      "Show the changed world. The thematic question is answered (or deliberately left open). The human element transcends the technology.",
  },
  toneRecommendations: [
    "Balance wonder with critical examination",
    "Ground speculation in human emotion",
    "Use technical details sparingly and purposefully",
    "The science should serve the story, not vice versa",
  ],
  pacingNotes:
    "Science fiction varies widely in pacing. Hard SF may move slower for exposition; space opera may be action-driven. Match pacing to your subgenre and story needs. World-building should never stop the story.",
  commonTropes: [
    "First contact",
    "Artificial intelligence",
    "Space exploration",
    "Time travel",
    "Dystopia/utopia",
    "Cyberpunk",
    "Post-apocalyptic",
    "Clone/genetic engineering",
  ],
  avoidList: [
    "Technology as magic without rules",
    "Info-dumping technical exposition",
    "Ignoring social implications of technology",
    "Deus ex machina technological solutions",
    "Characters as vehicles for explaining technology",
  ],
  readerExpectations: [
    "A compelling 'what if' premise",
    "Consistent, believable speculation",
    "Exploration of the premise's implications",
    "Human stories within the speculative frame",
    "Ideas that provoke thought",
  ],
  subgenres: ["Hard SF", "Space Opera", "Cyberpunk", "Military SF", "Dystopian", "Time Travel"],
};

// =============================================================================
// HORROR TEMPLATE (BONUS)
// =============================================================================

export const HORROR_TEMPLATE: GenreTemplate = {
  genre: "Horror",
  description:
    "Stories designed to frighten, unsettle, or disturb through supernatural or psychological elements.",
  coreElements: [
    {
      name: "Source of Fear",
      description: "The central threat - supernatural, psychological, or monstrous.",
      whenToInclude: "Hinted early, revealed gradually",
      required: true,
      tips: [
        "What you don't show is often scarier than what you do",
        "The unknown is inherently frightening",
        "The threat should be beyond normal control",
      ],
    },
    {
      name: "Escalating Dread",
      description: "Fear that builds progressively throughout the story.",
      whenToInclude: "Throughout, intensifying",
      required: true,
      tips: [
        "Start with unease, build to terror",
        "Use false scares sparingly",
        "The anticipation of horror is often worse than the horror",
      ],
    },
    {
      name: "Vulnerable Protagonist",
      description: "A character readers connect with who faces genuine danger.",
      whenToInclude: "Established from the start",
      required: true,
      tips: [
        "Readers must care about the protagonist's fate",
        "Vulnerability makes the threat more real",
        "Their fear should be relatable",
      ],
    },
    {
      name: "Atmosphere/Setting",
      description: "An environment that enhances the sense of dread and isolation.",
      whenToInclude: "Established early, maintained throughout",
      required: true,
      tips: [
        "Use setting to create unease",
        "Isolation (physical or psychological) increases fear",
        "Familiar places made strange are effective",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Establish normalcy before disruption. Plant seeds of unease. Make readers care about the protagonist before threatening them.",
    early:
      "The first encounters with the threat. Still deniable or explainable. The protagonist begins to suspect something is wrong.",
    midpoint:
      "The threat becomes undeniable. The protagonist is isolated or trapped. Attempts to escape or fight back fail. The true nature of the horror begins to reveal itself.",
    late: "Maximum terror. The protagonist faces their darkest fears. Resources are depleted. Hope seems lost.",
    climax:
      "The final confrontation with the source of fear. The protagonist must act despite terror. Resolution may be victory, survival, or tragic.",
    ending:
      "The aftermath. Is the threat truly gone? Show the cost. Horror often ends with a final twist or lingering unease.",
  },
  toneRecommendations: [
    "Build dread slowly before terror",
    "Use sensory details to ground fear",
    "The unknown is scarier than the known",
    "Give readers moments to breathe, then scare again",
  ],
  pacingNotes:
    "Horror requires careful pacing of fear. Too much too soon exhausts readers; too slow loses them. Build tension through anticipation. Use quiet moments to reset before the next scare. The climax should be the most intense sustained sequence.",
  commonTropes: [
    "Haunted house",
    "Ancient evil awakens",
    "Possession",
    "Monster in the dark",
    "Psychological terror",
    "Body horror",
    "Survival horror",
    "Curse/vengeance",
  ],
  avoidList: [
    "Jump scares without buildup",
    "Protagonists who act stupidly to create danger",
    "Over-explaining the monster/threat",
    "Clichéd scary settings without atmosphere",
    "Gore without emotional weight",
  ],
  readerExpectations: [
    "To be genuinely frightened",
    "A threat that feels dangerous and beyond control",
    "A protagonist worth rooting for",
    "Building dread and tension",
    "A satisfying (if terrifying) resolution",
  ],
  subgenres: [
    "Supernatural Horror",
    "Psychological Horror",
    "Gothic Horror",
    "Body Horror",
    "Cosmic Horror",
    "Slasher",
  ],
};

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

/** Canonical genre ids (no aliases). */
export const GENRE_IDS = [
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
] as const satisfies readonly GenreId[];

export const GENRE_TEMPLATES: Record<GenreId, GenreTemplate> = {
  romance: ROMANCE_TEMPLATE,
  mystery: MYSTERY_TEMPLATE,
  fantasy: FANTASY_TEMPLATE,
  thriller: THRILLER_TEMPLATE,
  literary_fiction: LITERARY_FICTION_TEMPLATE,
  science_fiction: SCIENCE_FICTION_TEMPLATE,
  horror: HORROR_TEMPLATE,
  historical_fiction: HISTORICAL_FICTION_TEMPLATE,
  young_adult: YOUNG_ADULT_TEMPLATE,
  middle_grade: MIDDLE_GRADE_TEMPLATE,
  childrens: CHILDRENS_TEMPLATE,
  memoir: MEMOIR_TEMPLATE,
};

/** Alias names accepted by lookups, mapped to canonical genre ids. */
export const GENRE_ALIASES: Readonly<Record<string, GenreId>> = {
  literary: "literary_fiction",
  "sci-fi": "science_fiction",
  sci_fi: "science_fiction",
  scifi: "science_fiction",
  sf: "science_fiction",
  historical: "historical_fiction",
  ya: "young_adult",
  teen: "young_adult",
  mg: "middle_grade",
  "middle-grade": "middle_grade",
  children: "childrens",
  // Lookups normalize spaces to underscores before matching, so alias keys are
  // written in their post-normalization form.
  "children's": "childrens",
  childrens_book: "childrens",
  kids: "childrens",
  picture_book: "childrens",
  chapter_book: "childrens",
  autobiography: "memoir",
  personal_essay: "memoir",
  nonfiction: "memoir",
};

/** The audience a genre is written for. Unknown genres are treated as adult. */
export function genreAudience(genre: string | null | undefined): GenreAudience {
  if (!genre) return "adult";
  return getGenreTemplate(genre)?.audience ?? "adult";
}

/** True when the genre is a non-fiction form (no invented cast, no plotted arc). */
export function isNonFictionGenre(genre: string | null | undefined): boolean {
  if (!genre) return false;
  return getGenreTemplate(genre)?.nonFiction === true;
}

/** Get a genre template by name (case-insensitive; accepts aliases, spaces, and hyphens). */
export function getGenreTemplate(genre: string): GenreTemplate | undefined {
  // Normalize the genre name
  const normalized = genre.toLowerCase().replace(/ /g, "_");

  // Check direct match first
  if (normalized in GENRE_TEMPLATES) {
    return GENRE_TEMPLATES[normalized as GenreId];
  }
  if (normalized in GENRE_ALIASES) {
    return GENRE_TEMPLATES[GENRE_ALIASES[normalized]];
  }

  // Try with hyphens converted to underscores
  const normalizedUnderscore = normalized.replace(/-/g, "_");
  if (normalizedUnderscore in GENRE_TEMPLATES) {
    return GENRE_TEMPLATES[normalizedUnderscore as GenreId];
  }
  if (normalizedUnderscore in GENRE_ALIASES) {
    return GENRE_TEMPLATES[GENRE_ALIASES[normalizedUnderscore]];
  }

  return undefined;
}

/**
 * Generate additional prompt text for outline generation, rendering the
 * template exactly as the Python `get_outline_prompt_additions()` did.
 * Returns `undefined` for an unknown genre.
 */
export function outlinePromptAdditions(genre: string): string | undefined {
  const template = getGenreTemplate(genre);
  if (!template) return undefined;

  const lines: string[] = [`\n## Genre Requirements: ${template.genre}\n`];
  lines.push(`${template.description}\n`);

  lines.push("\n### Core Elements (must include):\n");
  for (const elem of template.coreElements) {
    if (elem.required) {
      lines.push(`- **${elem.name}**: ${elem.description}`);
      lines.push(`  - When: ${elem.whenToInclude}`);
      if (elem.tips.length > 0) {
        lines.push(`  - Tips: ${elem.tips.join("; ")}`);
      }
    }
  }

  lines.push("\n### Reader Expectations:\n");
  for (const exp of template.readerExpectations) {
    lines.push(`- ${exp}`);
  }

  lines.push(`\n### Pacing Notes:\n${template.pacingNotes}\n`);

  if (template.avoidList.length > 0) {
    lines.push("\n### Avoid:\n");
    for (const avoid of template.avoidList) {
      lines.push(`- ${avoid}`);
    }
  }

  return lines.join("\n");
}

/**
 * Get genre-specific guidance for a chapter position.
 * Returns an empty string for an unknown genre.
 */
export function chapterPromptForGenre(genre: string, chapterPosition: ChapterPosition): string {
  const template = getGenreTemplate(genre);
  if (!template) return "";
  return template.chapterGuidance[chapterPosition] ?? "";
}

/** Get the list of things to avoid for a genre (empty for unknown genres). */
export function genreAvoidList(genre: string): readonly string[] {
  return getGenreTemplate(genre)?.avoidList ?? [];
}

/** Get reader expectations for a genre (empty for unknown genres). */
export function genreReaderExpectations(genre: string): readonly string[] {
  return getGenreTemplate(genre)?.readerExpectations ?? [];
}

export interface GenreSummary {
  genre: string;
  description: string;
  coreElementCount: number;
  coreElements: { name: string; required: boolean }[];
  commonTropes: readonly string[];
  subgenres: readonly string[];
}

/** Get a summary of a genre template for display. */
export function getGenreSummary(genre: string): GenreSummary | undefined {
  const template = getGenreTemplate(genre);
  if (!template) return undefined;

  return {
    genre: template.genre,
    description: template.description,
    coreElementCount: template.coreElements.length,
    coreElements: template.coreElements.map((elem) => ({
      name: elem.name,
      required: elem.required,
    })),
    commonTropes: template.commonTropes,
    subgenres: template.subgenres,
  };
}
