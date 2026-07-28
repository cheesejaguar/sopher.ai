/**
 * Author voice profiles for sopher.ai.
 *
 * Pre-defined author-inspired voice profiles, prompt rendering, and voice
 * blending. Ported from `_port/backend/voice_profiles.py`; all descriptive
 * text, parameter values, and thresholds are preserved verbatim.
 */

/** Characteristics that define a writing voice. */
export type VoiceCharacteristic =
  | "sentence_rhythm"
  | "vocabulary_level"
  | "emotional_intensity"
  | "imagery_density"
  | "dialogue_naturalness"
  | "narrative_distance"
  | "philosophical_depth"
  | "humor_style"
  | "pacing_tendency"
  | "detail_orientation";

export const VOICE_CHARACTERISTICS: readonly VoiceCharacteristic[] = [
  "sentence_rhythm",
  "vocabulary_level",
  "emotional_intensity",
  "imagery_density",
  "dialogue_naturalness",
  "narrative_distance",
  "philosophical_depth",
  "humor_style",
  "pacing_tendency",
  "detail_orientation",
];

/** Types of sentence rhythm patterns. */
export type SentenceRhythm =
  | "staccato" // Short, punchy
  | "flowing" // Long, connected
  | "varied" // Mix of lengths
  | "hypnotic" // Repetitive patterns
  | "conversational"; // Natural speech

/** Vocabulary complexity levels. */
export type VocabularyLevel = "simple" | "moderate" | "sophisticated" | "literary" | "technical";

/** Emotional intensity levels. */
export type EmotionalIntensity = "restrained" | "subtle" | "moderate" | "expressive" | "intense";

/** Density of imagery and description. */
export type ImageryDensity = "sparse" | "moderate" | "rich" | "lush" | "overwhelming";

/** Narrative distance from characters. */
export type NarrativeDistance = "intimate" | "close" | "moderate" | "distant" | "omniscient";

/** Types of humor style. */
export type HumorStyle = "none" | "dry" | "witty" | "sardonic" | "absurdist" | "slapstick";

/** Pacing tendencies. */
export type PacingTendency = "slow_burn" | "measured" | "brisk" | "rapid" | "variable";

/** Adjustable parameters for a writing voice. */
export interface VoiceParameters {
  sentenceRhythm: SentenceRhythm;
  vocabularyLevel: VocabularyLevel;
  emotionalIntensity: EmotionalIntensity;
  imageryDensity: ImageryDensity;
  narrativeDistance: NarrativeDistance;
  humorStyle: HumorStyle;
  pacingTendency: PacingTendency;
  // Numeric parameters (0.0 to 1.0)
  dialogueNaturalness: number;
  philosophicalDepth: number;
  detailOrientation: number;
  sensoryFocus: number;
  introspectionLevel: number;
  actionFocus: number;
}

/** Default voice parameters (the Python `VoiceParameters()` defaults). */
export const DEFAULT_VOICE_PARAMETERS: VoiceParameters = {
  sentenceRhythm: "varied",
  vocabularyLevel: "moderate",
  emotionalIntensity: "moderate",
  imageryDensity: "moderate",
  narrativeDistance: "moderate",
  humorStyle: "none",
  pacingTendency: "measured",
  dialogueNaturalness: 0.5,
  philosophicalDepth: 0.3,
  detailOrientation: 0.5,
  sensoryFocus: 0.5,
  introspectionLevel: 0.5,
  actionFocus: 0.5,
};

export type VoiceProfileId =
  | "hemingway"
  | "austen"
  | "king"
  | "pratchett"
  | "mccarthy"
  | "rowling"
  | "atwood"
  | "gaiman"
  | "christie"
  | "sanderson";

export const VOICE_PROFILE_IDS: readonly VoiceProfileId[] = [
  "hemingway",
  "austen",
  "king",
  "pratchett",
  "mccarthy",
  "rowling",
  "atwood",
  "gaiman",
  "christie",
  "sanderson",
];

/** A complete voice profile configuration. */
export interface VoiceProfile {
  id: VoiceProfileId;
  name: string;
  description: string;
  /** Author or work this is inspired by. */
  inspiredBy: string;
  parameters: VoiceParameters;
  // Style notes
  signatureTechniques: string[];
  avoids: string[];
  // Genre affinities
  bestForGenres: string[];
}

/** Pre-defined author-inspired voice profiles. */
export const VOICE_PROFILES: Record<VoiceProfileId, VoiceProfile> = {
  hemingway: {
    id: "hemingway",
    name: "Hemingway",
    description: "sparse, direct, and emotionally understated",
    inspiredBy: "Ernest Hemingway",
    parameters: {
      sentenceRhythm: "staccato",
      vocabularyLevel: "simple",
      emotionalIntensity: "restrained",
      imageryDensity: "sparse",
      narrativeDistance: "close",
      humorStyle: "dry",
      pacingTendency: "measured",
      dialogueNaturalness: 0.9,
      philosophicalDepth: 0.3,
      detailOrientation: 0.4,
      sensoryFocus: 0.6,
      introspectionLevel: 0.2,
      actionFocus: 0.7,
    },
    signatureTechniques: [
      "iceberg theory (leave meaning implicit)",
      "repetition for emphasis",
      "simple declarative sentences",
      "dialogue-heavy scenes",
      "understated emotion",
    ],
    avoids: [
      "adverbs",
      "flowery language",
      "excessive description",
      "explaining emotions",
      "complex vocabulary",
    ],
    bestForGenres: ["literary fiction", "war fiction", "adventure"],
  },
  austen: {
    id: "austen",
    name: "Austen",
    description: "witty, ironic, and socially observant",
    inspiredBy: "Jane Austen",
    parameters: {
      sentenceRhythm: "flowing",
      vocabularyLevel: "sophisticated",
      emotionalIntensity: "subtle",
      imageryDensity: "moderate",
      narrativeDistance: "omniscient",
      humorStyle: "witty",
      pacingTendency: "measured",
      dialogueNaturalness: 0.8,
      philosophicalDepth: 0.4,
      detailOrientation: 0.6,
      sensoryFocus: 0.4,
      introspectionLevel: 0.6,
      actionFocus: 0.2,
    },
    signatureTechniques: [
      "free indirect discourse",
      "ironic narration",
      "social commentary",
      "witty dialogue",
      "parallel structure",
    ],
    avoids: ["melodrama", "explicit emotion", "action sequences", "modern slang"],
    bestForGenres: ["romance", "comedy of manners", "historical fiction"],
  },
  king: {
    id: "king",
    name: "King",
    description: "conversational, immersive, and psychologically deep",
    inspiredBy: "Stephen King",
    parameters: {
      sentenceRhythm: "conversational",
      vocabularyLevel: "moderate",
      emotionalIntensity: "expressive",
      imageryDensity: "rich",
      narrativeDistance: "intimate",
      humorStyle: "sardonic",
      pacingTendency: "variable",
      dialogueNaturalness: 0.95,
      philosophicalDepth: 0.5,
      detailOrientation: 0.8,
      sensoryFocus: 0.8,
      introspectionLevel: 0.8,
      actionFocus: 0.5,
    },
    signatureTechniques: [
      "deep POV",
      "specific brand names and cultural references",
      "internal monologue",
      "building dread through mundane details",
      "authentic dialogue with regional flavor",
    ],
    avoids: ["passive voice", "abstract description", "distant narration"],
    bestForGenres: ["horror", "thriller", "supernatural fiction"],
  },
  pratchett: {
    id: "pratchett",
    name: "Pratchett",
    description: "witty, satirical, and humanistic",
    inspiredBy: "Terry Pratchett",
    parameters: {
      sentenceRhythm: "varied",
      vocabularyLevel: "sophisticated",
      emotionalIntensity: "moderate",
      imageryDensity: "rich",
      narrativeDistance: "omniscient",
      humorStyle: "witty",
      pacingTendency: "brisk",
      dialogueNaturalness: 0.85,
      philosophicalDepth: 0.7,
      detailOrientation: 0.7,
      sensoryFocus: 0.5,
      introspectionLevel: 0.5,
      actionFocus: 0.4,
    },
    signatureTechniques: [
      "footnotes and asides",
      "satirical observations",
      "extended metaphors",
      "wordplay and puns",
      "philosophical musings disguised as humor",
    ],
    avoids: ["taking itself too seriously", "grimdark tone", "purple prose"],
    bestForGenres: ["fantasy", "satire", "comedy"],
  },
  mccarthy: {
    id: "mccarthy",
    name: "McCarthy",
    description: "biblical, sparse, and unflinching",
    inspiredBy: "Cormac McCarthy",
    parameters: {
      sentenceRhythm: "varied",
      vocabularyLevel: "literary",
      emotionalIntensity: "restrained",
      imageryDensity: "lush",
      narrativeDistance: "distant",
      humorStyle: "dry",
      pacingTendency: "slow_burn",
      dialogueNaturalness: 0.7,
      philosophicalDepth: 0.9,
      detailOrientation: 0.8,
      sensoryFocus: 0.9,
      introspectionLevel: 0.3,
      actionFocus: 0.5,
    },
    signatureTechniques: [
      "minimal punctuation in dialogue",
      "landscape as character",
      "biblical cadence",
      "violence rendered beautifully",
      "long descriptive passages",
    ],
    avoids: ["quotation marks", "explaining violence", "happy endings", "moral simplicity"],
    bestForGenres: ["western", "literary fiction", "post-apocalyptic"],
  },
  rowling: {
    id: "rowling",
    name: "Rowling",
    description: "accessible, warm, and whimsical",
    inspiredBy: "J.K. Rowling",
    parameters: {
      sentenceRhythm: "varied",
      vocabularyLevel: "moderate",
      emotionalIntensity: "expressive",
      imageryDensity: "rich",
      narrativeDistance: "close",
      humorStyle: "witty",
      pacingTendency: "variable",
      dialogueNaturalness: 0.85,
      philosophicalDepth: 0.4,
      detailOrientation: 0.75,
      sensoryFocus: 0.6,
      introspectionLevel: 0.6,
      actionFocus: 0.5,
    },
    signatureTechniques: [
      "creative naming",
      "British humor and understatement",
      "foreshadowing through details",
      "character-specific speech patterns",
      "worldbuilding through casual mention",
    ],
    avoids: ["excessive exposition", "adult content", "moral ambiguity in protagonists"],
    bestForGenres: ["young adult", "fantasy", "adventure"],
  },
  atwood: {
    id: "atwood",
    name: "Atwood",
    description: "incisive, layered, and politically aware",
    inspiredBy: "Margaret Atwood",
    parameters: {
      sentenceRhythm: "varied",
      vocabularyLevel: "literary",
      emotionalIntensity: "subtle",
      imageryDensity: "rich",
      narrativeDistance: "intimate",
      humorStyle: "dry",
      pacingTendency: "measured",
      dialogueNaturalness: 0.75,
      philosophicalDepth: 0.8,
      detailOrientation: 0.7,
      sensoryFocus: 0.7,
      introspectionLevel: 0.8,
      actionFocus: 0.2,
    },
    signatureTechniques: [
      "layered symbolism",
      "feminist perspective",
      "fragmented memory",
      "unreliable narration",
      "present tense narration",
    ],
    avoids: ["simple binaries", "passive female characters", "exposition dumps"],
    bestForGenres: ["dystopian", "literary fiction", "speculative fiction"],
  },
  gaiman: {
    id: "gaiman",
    name: "Gaiman",
    description: "mythic, dreamy, and darkly whimsical",
    inspiredBy: "Neil Gaiman",
    parameters: {
      sentenceRhythm: "hypnotic",
      vocabularyLevel: "literary",
      emotionalIntensity: "moderate",
      imageryDensity: "lush",
      narrativeDistance: "moderate",
      humorStyle: "dry",
      pacingTendency: "variable",
      dialogueNaturalness: 0.8,
      philosophicalDepth: 0.6,
      detailOrientation: 0.7,
      sensoryFocus: 0.7,
      introspectionLevel: 0.5,
      actionFocus: 0.3,
    },
    signatureTechniques: [
      "fairy tale cadence",
      "mythology remixed",
      "personification of abstract concepts",
      "quiet horror",
      "British understatement meets American weirdness",
    ],
    avoids: ["explicit violence", "cynicism without hope", "mundane explanations for magic"],
    bestForGenres: ["fantasy", "horror", "urban fantasy", "fairy tales"],
  },
  christie: {
    id: "christie",
    name: "Christie",
    description: "precise, puzzle-focused, and deceptively simple",
    inspiredBy: "Agatha Christie",
    parameters: {
      sentenceRhythm: "conversational",
      vocabularyLevel: "moderate",
      emotionalIntensity: "subtle",
      imageryDensity: "moderate",
      narrativeDistance: "moderate",
      humorStyle: "dry",
      pacingTendency: "brisk",
      dialogueNaturalness: 0.8,
      philosophicalDepth: 0.2,
      detailOrientation: 0.9,
      sensoryFocus: 0.4,
      introspectionLevel: 0.3,
      actionFocus: 0.3,
    },
    signatureTechniques: [
      "fair-play clue placement",
      "misdirection through emphasis",
      "character-based red herrings",
      "the gathering scene",
      "theatrical reveals",
    ],
    avoids: ["graphic violence", "excessive psychology", "purple prose", "loose ends"],
    bestForGenres: ["mystery", "cozy mystery", "detective fiction"],
  },
  sanderson: {
    id: "sanderson",
    name: "Sanderson",
    description: "clear, systematic, and epic",
    inspiredBy: "Brandon Sanderson",
    parameters: {
      sentenceRhythm: "varied",
      vocabularyLevel: "moderate",
      emotionalIntensity: "expressive",
      imageryDensity: "moderate",
      narrativeDistance: "close",
      humorStyle: "witty",
      pacingTendency: "variable",
      dialogueNaturalness: 0.85,
      philosophicalDepth: 0.5,
      detailOrientation: 0.8,
      sensoryFocus: 0.5,
      introspectionLevel: 0.6,
      actionFocus: 0.7,
    },
    signatureTechniques: [
      "hard magic systems",
      "avalanche endings",
      "character growth arcs",
      "multiple POV with distinct voices",
      "foreshadowing through worldbuilding",
    ],
    avoids: ["deus ex machina", "grimdark without hope", "unexplained magic", "gratuitous content"],
    bestForGenres: ["epic fantasy", "science fiction", "young adult fantasy"],
  },
};

// --- Prompt rendering (port of VoicePromptGenerator) ---

const SENTENCE_RHYTHM_PROMPTS: Record<SentenceRhythm, string> = {
  staccato: "Use short, punchy sentences. Cut the fat. Get to the point.",
  flowing: "Use long, flowing sentences that carry the reader along like a river.",
  varied: "Vary sentence length for rhythm. Short. Then longer, more complex passages that build.",
  hypnotic: "Use repetitive patterns and parallel structures for a hypnotic effect.",
  conversational: "Write as if speaking naturally to a friend. Use contractions. Keep it real.",
};

const VOCABULARY_PROMPTS: Record<VocabularyLevel, string> = {
  simple: "Use simple, everyday words. Avoid jargon and pretension.",
  moderate: "Use clear vocabulary accessible to general readers.",
  sophisticated: "Employ a sophisticated vocabulary when appropriate.",
  literary: "Use rich, literary vocabulary with precise word choices.",
  technical: "Use precise technical terminology where appropriate.",
};

const EMOTIONAL_INTENSITY_PROMPTS: Record<EmotionalIntensity, string> = {
  restrained: "Keep emotions understated. Show restraint. Let readers infer.",
  subtle: "Express emotions subtly through actions and details.",
  moderate: "Balance emotional content naturally.",
  expressive: "Allow characters to express emotions openly.",
  intense: "Go deep into emotional experiences. Don't hold back.",
};

const IMAGERY_DENSITY_PROMPTS: Record<ImageryDensity, string> = {
  sparse: "Use minimal description. Let readers fill in the gaps.",
  moderate: "Balance description with action and dialogue.",
  rich: "Use rich sensory details to bring scenes to life.",
  lush: "Layer imagery densely. Immerse readers in sensory experience.",
  overwhelming: "Create overwhelming sensory experiences.",
};

const NARRATIVE_DISTANCE_PROMPTS: Record<NarrativeDistance, string> = {
  intimate: "Stay deep inside the character's head. Use their voice, their thoughts.",
  close: "Stay close to the viewpoint character's experience.",
  moderate: "Balance internal and external perspectives.",
  distant: "Maintain narrative distance. Observe more than inhabit.",
  omniscient: "Use an omniscient perspective, moving between viewpoints freely.",
};

const HUMOR_STYLE_PROMPTS: Record<Exclude<HumorStyle, "none">, string> = {
  dry: "Use dry, understated humor. Deadpan delivery.",
  witty: "Include witty observations and clever wordplay.",
  sardonic: "Use sardonic, sometimes dark humor.",
  absurdist: "Include absurdist humor and surreal moments.",
  slapstick: "Include physical comedy and broad humor.",
};

const PACING_PROMPTS: Record<PacingTendency, string> = {
  slow_burn: "Take your time. Build slowly. Let tension accumulate.",
  measured: "Maintain a steady, measured pace.",
  brisk: "Keep things moving. Don't linger too long.",
  rapid: "Fast pace. Quick cuts. Momentum.",
  variable: "Vary the pace to match the emotional content.",
};

/**
 * The subset of a voice profile needed for prompt rendering. Full profiles
 * satisfy this; blended voices provide only a name and parameters.
 */
export interface VoicePromptSource {
  name: string;
  description?: string;
  inspiredBy?: string;
  parameters: VoiceParameters;
  signatureTechniques?: string[];
  avoids?: string[];
}

/** Generate a writing style prompt from a voice profile. */
export function renderVoicePrompt(profile: VoicePromptSource): string {
  const params = profile.parameters;
  const sections: string[] = [];

  // Core voice description
  if (profile.description) {
    sections.push(`Write in a voice that is ${profile.description}`);
  }
  if (profile.inspiredBy) {
    sections.push(`Take inspiration from the style of ${profile.inspiredBy}.`);
  }

  sections.push(SENTENCE_RHYTHM_PROMPTS[params.sentenceRhythm]);
  sections.push(VOCABULARY_PROMPTS[params.vocabularyLevel]);
  sections.push(EMOTIONAL_INTENSITY_PROMPTS[params.emotionalIntensity]);
  sections.push(IMAGERY_DENSITY_PROMPTS[params.imageryDensity]);
  sections.push(NARRATIVE_DISTANCE_PROMPTS[params.narrativeDistance]);
  if (params.humorStyle !== "none") {
    sections.push(HUMOR_STYLE_PROMPTS[params.humorStyle]);
  }
  sections.push(PACING_PROMPTS[params.pacingTendency]);

  // Numeric parameters
  if (params.dialogueNaturalness > 0.7) {
    sections.push("Make dialogue sound natural and authentic to each character.");
  } else if (params.dialogueNaturalness < 0.3) {
    sections.push("Dialogue can be stylized or formal.");
  }

  if (params.philosophicalDepth > 0.7) {
    sections.push("Explore philosophical themes and existential questions.");
  } else if (params.philosophicalDepth > 0.5) {
    sections.push("Touch on deeper meanings and themes where appropriate.");
  }

  if (params.detailOrientation > 0.7) {
    sections.push("Include specific, concrete details.");
  } else if (params.detailOrientation < 0.3) {
    sections.push("Focus on essentials; skip unnecessary details.");
  }

  if (params.sensoryFocus > 0.7) {
    sections.push("Engage all five senses in descriptions.");
  }

  if (params.introspectionLevel > 0.7) {
    sections.push("Include deep character introspection and internal monologue.");
  } else if (params.introspectionLevel < 0.3) {
    sections.push("Focus on external action rather than internal thoughts.");
  }

  if (params.actionFocus > 0.7) {
    sections.push("Emphasize action and physical movement.");
  }

  // Signature techniques
  if (profile.signatureTechniques && profile.signatureTechniques.length > 0) {
    sections.push(`Employ these techniques: ${profile.signatureTechniques.slice(0, 5).join(", ")}`);
  }

  // Avoids
  if (profile.avoids && profile.avoids.length > 0) {
    sections.push(`Avoid: ${profile.avoids.slice(0, 5).join(", ")}`);
  }

  return sections.join("\n\n");
}

/** Render the style-direction prompt for a predefined voice profile. */
export function voicePrompt(profileId: VoiceProfileId): string {
  return renderVoicePrompt(VOICE_PROFILES[profileId]);
}

/** Generate a brief one-paragraph style description. */
export function renderVoiceBriefPrompt(profile: VoicePromptSource): string {
  const params = profile.parameters;
  const parts: string[] = [];

  if (profile.inspiredBy) {
    parts.push(`in the style of ${profile.inspiredBy}`);
  }

  // Key characteristics
  if (params.sentenceRhythm === "staccato") {
    parts.push("short punchy sentences");
  } else if (params.sentenceRhythm === "flowing") {
    parts.push("flowing prose");
  }

  if (params.vocabularyLevel === "literary") {
    parts.push("literary vocabulary");
  } else if (params.vocabularyLevel === "simple") {
    parts.push("simple direct language");
  }

  if (params.emotionalIntensity === "intense") {
    parts.push("emotional intensity");
  } else if (params.emotionalIntensity === "restrained") {
    parts.push("emotional restraint");
  }

  if (params.imageryDensity === "lush") {
    parts.push("lush imagery");
  } else if (params.imageryDensity === "sparse") {
    parts.push("spare description");
  }

  if (params.humorStyle !== "none") {
    parts.push(`${params.humorStyle} humor`);
  }

  if (parts.length === 0) {
    return `Write in a ${profile.name} voice.`;
  }

  return `Write with ${parts.join(", ")}.`;
}

/** Render the brief style prompt for a predefined voice profile. */
export function voiceBriefPrompt(profileId: VoiceProfileId): string {
  return renderVoiceBriefPrompt(VOICE_PROFILES[profileId]);
}

// --- Voice blending (port of VoiceBlender) ---

/** A voice created by blending two profiles. */
export interface BlendedVoice {
  name: string;
  sourceProfiles: [string, string];
  /** Normalized weights, summing to 1. */
  weights: [number, number];
  parameters: VoiceParameters;
}

/**
 * Blend two voice profiles into a new voice. Numeric parameters use the
 * weighted average; enum parameters come from the highest-weighted profile
 * (ties favor the first, matching the Python blender).
 */
export function blendVoices(
  a: VoiceProfileId | VoiceProfile,
  b: VoiceProfileId | VoiceProfile,
  weights: [number, number] = [0.5, 0.5],
  name = "Blended Voice",
): BlendedVoice {
  const profileA = typeof a === "string" ? VOICE_PROFILES[a] : a;
  const profileB = typeof b === "string" ? VOICE_PROFILES[b] : b;

  // Normalize weights
  const total = weights[0] + weights[1];
  const weightA = weights[0] / total;
  const weightB = weights[1] / total;

  const dominant = weightA >= weightB ? profileA : profileB;
  const pa = profileA.parameters;
  const pb = profileB.parameters;

  return {
    name,
    sourceProfiles: [profileA.id, profileB.id],
    weights: [weightA, weightB],
    parameters: {
      // Enum parameters come from the highest-weighted profile
      sentenceRhythm: dominant.parameters.sentenceRhythm,
      vocabularyLevel: dominant.parameters.vocabularyLevel,
      emotionalIntensity: dominant.parameters.emotionalIntensity,
      imageryDensity: dominant.parameters.imageryDensity,
      narrativeDistance: dominant.parameters.narrativeDistance,
      humorStyle: dominant.parameters.humorStyle,
      pacingTendency: dominant.parameters.pacingTendency,
      // Numeric parameters use the weighted average
      dialogueNaturalness: pa.dialogueNaturalness * weightA + pb.dialogueNaturalness * weightB,
      philosophicalDepth: pa.philosophicalDepth * weightA + pb.philosophicalDepth * weightB,
      detailOrientation: pa.detailOrientation * weightA + pb.detailOrientation * weightB,
      sensoryFocus: pa.sensoryFocus * weightA + pb.sensoryFocus * weightB,
      introspectionLevel: pa.introspectionLevel * weightA + pb.introspectionLevel * weightB,
      actionFocus: pa.actionFocus * weightA + pb.actionFocus * weightB,
    },
  };
}

/** Generate a writing prompt for a blended voice. */
export function blendedVoicePrompt(blended: BlendedVoice): string {
  return renderVoicePrompt({ name: blended.name, parameters: blended.parameters });
}

/** Get voice profiles suitable for a specific genre (substring match both ways). */
export function getVoiceProfilesForGenre(genre: string): VoiceProfile[] {
  const genreLower = genre.toLowerCase();
  return Object.values(VOICE_PROFILES).filter((profile) =>
    profile.bestForGenres.some((profileGenre) => {
      const pg = profileGenre.toLowerCase();
      return pg.includes(genreLower) || genreLower.includes(pg);
    }),
  );
}
