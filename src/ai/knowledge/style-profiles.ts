/**
 * Writing style profiles for chapter generation.
 *
 * Comprehensive writing style profiles that can be applied to chapter
 * generation to ensure consistent voice, prose style, and quality. Ported
 * from `_port/backend/style_profiles.py`; all parameter values and prompt
 * text are preserved verbatim.
 */

/** Prose style options. */
export type ProseStyle = "sparse" | "conversational" | "lyrical" | "formal" | "literary";

/** Dialogue style options. */
export type DialogueStyle = "realistic" | "stylized" | "minimal" | "theatrical";

/** Description density options. */
export type DescriptionDensity = "minimal" | "moderate" | "rich";

/** Sentence structure variety options. */
export type SentenceVariety = "simple" | "varied" | "complex";

/** Vocabulary level options. */
export type VocabularyLevel = "accessible" | "moderate" | "advanced";

/** Humor level options. */
export type HumorLevel = "none" | "subtle" | "moderate" | "frequent";

/** Point of view options. */
export type POV =
  | "first_person"
  | "second_person"
  | "third_person_limited"
  | "third_person_omniscient"
  | "third_person_objective";

/** Narrative tense options. */
export type Tense = "past" | "present";

/** Scene transition style options. */
export type SceneTransitionStyle = "smooth" | "abrupt" | "chapter_break";

/** Comprehensive writing style profile for chapter generation. */
export interface WritingStyleProfile {
  name: string;
  description: string;
  // Core style settings
  proseStyle: ProseStyle;
  dialogueStyle: DialogueStyle;
  descriptionDensity: DescriptionDensity;
  sentenceVariety: SentenceVariety;
  vocabularyLevel: VocabularyLevel;
  humorLevel: HumorLevel;
  // Narrative settings
  pov: POV;
  tense: Tense;
  // Content preferences
  sensoryDetails: boolean;
  internalMonologue: boolean;
  showDontTell: boolean;
  // Pacing preferences
  /** 0.0 = all reflection, 1.0 = all action */
  actionToReflectionRatio: number;
  sceneTransitionStyle: SceneTransitionStyle;
}

export type StyleProfileId =
  | "hemingway"
  | "literary_fiction"
  | "commercial_fiction"
  | "romance"
  | "thriller"
  | "fantasy"
  | "mystery"
  | "horror"
  | "young_adult"
  | "science_fiction";

export const STYLE_PROFILE_IDS: readonly StyleProfileId[] = [
  "hemingway",
  "literary_fiction",
  "commercial_fiction",
  "romance",
  "thriller",
  "fantasy",
  "mystery",
  "horror",
  "young_adult",
  "science_fiction",
];

/** Pre-defined style profiles for common genres and styles. */
export const STYLE_PROFILES: Record<StyleProfileId, WritingStyleProfile> = {
  hemingway: {
    name: "Hemingway",
    description: "Spare, direct prose inspired by Ernest Hemingway",
    proseStyle: "sparse",
    dialogueStyle: "realistic",
    descriptionDensity: "minimal",
    sentenceVariety: "simple",
    vocabularyLevel: "accessible",
    humorLevel: "none",
    pov: "third_person_limited",
    tense: "past",
    sensoryDetails: false,
    internalMonologue: false,
    showDontTell: true,
    actionToReflectionRatio: 0.5,
    sceneTransitionStyle: "smooth",
  },
  literary_fiction: {
    name: "Literary Fiction",
    description: "Sophisticated literary prose with careful attention to craft",
    proseStyle: "literary",
    dialogueStyle: "stylized",
    descriptionDensity: "rich",
    sentenceVariety: "complex",
    vocabularyLevel: "advanced",
    humorLevel: "subtle",
    pov: "third_person_limited",
    tense: "past",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.5,
    sceneTransitionStyle: "smooth",
  },
  commercial_fiction: {
    name: "Commercial Fiction",
    description: "Accessible, engaging prose for broad appeal",
    proseStyle: "conversational",
    dialogueStyle: "realistic",
    descriptionDensity: "moderate",
    sentenceVariety: "varied",
    vocabularyLevel: "accessible",
    humorLevel: "subtle",
    pov: "third_person_limited",
    tense: "past",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.5,
    sceneTransitionStyle: "smooth",
  },
  romance: {
    name: "Romance",
    description: "Emotionally rich prose focused on character connections",
    proseStyle: "conversational",
    dialogueStyle: "realistic",
    descriptionDensity: "moderate",
    sentenceVariety: "varied",
    vocabularyLevel: "accessible",
    humorLevel: "moderate",
    pov: "third_person_limited",
    tense: "past",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.3,
    sceneTransitionStyle: "smooth",
  },
  thriller: {
    name: "Thriller",
    description: "Fast-paced, tension-driven prose",
    proseStyle: "sparse",
    dialogueStyle: "realistic",
    descriptionDensity: "minimal",
    sentenceVariety: "varied",
    vocabularyLevel: "accessible",
    humorLevel: "none",
    pov: "third_person_limited",
    tense: "past",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.7,
    sceneTransitionStyle: "smooth",
  },
  fantasy: {
    name: "Fantasy",
    description: "Immersive world-building with rich descriptions",
    proseStyle: "lyrical",
    dialogueStyle: "stylized",
    descriptionDensity: "rich",
    sentenceVariety: "varied",
    vocabularyLevel: "moderate",
    humorLevel: "subtle",
    pov: "third_person_limited",
    tense: "past",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.5,
    sceneTransitionStyle: "smooth",
  },
  mystery: {
    name: "Mystery",
    description: "Atmospheric prose with careful pacing of revelations",
    proseStyle: "conversational",
    dialogueStyle: "realistic",
    descriptionDensity: "moderate",
    sentenceVariety: "varied",
    vocabularyLevel: "moderate",
    humorLevel: "subtle",
    pov: "first_person",
    tense: "past",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.5,
    sceneTransitionStyle: "smooth",
  },
  horror: {
    name: "Horror",
    description: "Atmospheric, dread-building prose",
    proseStyle: "literary",
    dialogueStyle: "minimal",
    descriptionDensity: "rich",
    sentenceVariety: "varied",
    vocabularyLevel: "moderate",
    humorLevel: "none",
    pov: "third_person_limited",
    tense: "past",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.5,
    sceneTransitionStyle: "smooth",
  },
  young_adult: {
    name: "Young Adult",
    description: "Accessible, emotionally resonant prose for teen readers",
    proseStyle: "conversational",
    dialogueStyle: "realistic",
    descriptionDensity: "moderate",
    sentenceVariety: "varied",
    vocabularyLevel: "accessible",
    humorLevel: "moderate",
    pov: "first_person",
    tense: "present",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.5,
    sceneTransitionStyle: "smooth",
  },
  science_fiction: {
    name: "Science Fiction",
    description: "Clear, idea-driven prose with technical clarity",
    proseStyle: "conversational",
    dialogueStyle: "realistic",
    descriptionDensity: "moderate",
    sentenceVariety: "varied",
    vocabularyLevel: "moderate",
    humorLevel: "subtle",
    pov: "third_person_limited",
    tense: "past",
    sensoryDetails: true,
    internalMonologue: true,
    showDontTell: true,
    actionToReflectionRatio: 0.5,
    sceneTransitionStyle: "smooth",
  },
};

// --- Prompt rendering (port of WritingStyleProfile.to_prompt) ---

const POV_DESCRIPTIONS: Record<POV, string> = {
  first_person: "Write in first person perspective",
  second_person: "Write in second person, addressing the reader as 'you'",
  third_person_limited:
    "Write in third person limited, staying close to the POV character's thoughts and perceptions",
  third_person_omniscient:
    "Write in third person omniscient with access to all characters' thoughts",
  third_person_objective:
    "Write in third person objective, describing only external actions without internal thoughts",
};

const TENSE_DESCRIPTIONS: Record<Tense, string> = {
  past: "Use past tense throughout",
  present: "Use present tense for immediacy",
};

const PROSE_DESCRIPTIONS: Record<ProseStyle, string> = {
  sparse:
    "Use sparse, minimalist prose - every word must earn its place. Short sentences. No purple prose.",
  conversational: "Use natural, conversational prose that flows easily",
  lyrical: "Use lyrical, poetic prose with rich imagery and rhythm",
  formal: "Use formal, polished prose with precise language",
  literary: "Use literary prose with careful attention to craft and style",
};

const DIALOGUE_DESCRIPTIONS: Record<DialogueStyle, string> = {
  realistic: "Write natural, realistic dialogue that sounds like real speech",
  stylized: "Write stylized dialogue with distinct character voices",
  minimal: "Keep dialogue minimal and impactful",
  theatrical: "Write dramatic, theatrical dialogue",
};

const DENSITY_DESCRIPTIONS: Record<DescriptionDensity, string> = {
  minimal: "Keep descriptions brief and functional",
  moderate: "Include balanced descriptions that set the scene without overloading",
  rich: "Include rich, detailed descriptions of settings and characters",
};

const SENTENCE_DESCRIPTIONS: Record<SentenceVariety, string> = {
  simple: "Use mostly simple, clear sentences",
  varied: "Vary sentence length and structure for rhythm",
  complex: "Use complex sentence structures for sophistication",
};

const VOCAB_DESCRIPTIONS: Record<VocabularyLevel, string> = {
  accessible: "Use accessible vocabulary for broad readability",
  moderate: "Use moderate vocabulary with occasional elevated words",
  advanced: "Use advanced vocabulary appropriate for literary fiction",
};

const HUMOR_DESCRIPTIONS: Record<Exclude<HumorLevel, "none">, string> = {
  subtle: "Include subtle humor and wit where appropriate",
  moderate: "Include moderate humor to lighten the narrative",
  frequent: "Include frequent humor and comedic elements",
};

/** Generate a style prompt for LLM generation from a style profile. */
export function renderStylePrompt(profile: WritingStyleProfile): string {
  const parts: string[] = [];

  // POV and tense
  parts.push(POV_DESCRIPTIONS[profile.pov]);
  parts.push(TENSE_DESCRIPTIONS[profile.tense]);

  // Prose style
  parts.push(PROSE_DESCRIPTIONS[profile.proseStyle]);

  // Dialogue style
  parts.push(DIALOGUE_DESCRIPTIONS[profile.dialogueStyle]);

  // Description density
  parts.push(DENSITY_DESCRIPTIONS[profile.descriptionDensity]);

  // Sentence variety
  parts.push(SENTENCE_DESCRIPTIONS[profile.sentenceVariety]);

  // Vocabulary
  parts.push(VOCAB_DESCRIPTIONS[profile.vocabularyLevel]);

  // Humor
  if (profile.humorLevel !== "none") {
    parts.push(HUMOR_DESCRIPTIONS[profile.humorLevel]);
  }

  // Content preferences
  if (profile.sensoryDetails) {
    parts.push("Include vivid sensory details (sight, sound, smell, touch, taste)");
  }

  if (profile.internalMonologue) {
    parts.push("Include character's internal thoughts and reflections");
  }

  if (profile.showDontTell) {
    parts.push("Show emotions and states through action and dialogue rather than telling");
  }

  return parts.join(". ") + ".";
}

/** Render the style prompt for a predefined style profile. */
export function stylePrompt(profileId: StyleProfileId): string {
  return renderStylePrompt(STYLE_PROFILES[profileId]);
}

function normalizeStyleName(name: string): string {
  return name.toLowerCase().replace(/ /g, "_").replace(/-/g, "_");
}

/** Get a pre-defined style profile by name (case/spacing/hyphen insensitive). */
export function getStyleProfile(name: string): WritingStyleProfile | undefined {
  return (STYLE_PROFILES as Record<string, WritingStyleProfile>)[normalizeStyleName(name)];
}

/** Genre → recommended style profile mapping, including common aliases. */
const GENRE_STYLE_MAP: Record<string, StyleProfileId> = {
  romance: "romance",
  thriller: "thriller",
  mystery: "mystery",
  fantasy: "fantasy",
  science_fiction: "science_fiction",
  sci_fi: "science_fiction",
  scifi: "science_fiction",
  horror: "horror",
  literary_fiction: "literary_fiction",
  literary: "literary_fiction",
  young_adult: "young_adult",
  ya: "young_adult",
};

/** Get a recommended style profile for a genre (commercial fiction fallback). */
export function getStyleForGenre(genre: string): WritingStyleProfile {
  const profileId = GENRE_STYLE_MAP[normalizeStyleName(genre)] ?? "commercial_fiction";
  return STYLE_PROFILES[profileId];
}
