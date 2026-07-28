// Ported from _port/backend/content_filter.py (build_content_filter_prompt and
// its guidance data). Guidance strings are preserved verbatim.
// Pure data + functions; no runtime dependencies.

/** Audience age classification levels. */
export type AudienceLevel =
  | "children" // Ages 6-10
  | "middle_grade" // Ages 10-14
  | "young_adult" // Ages 14-18
  | "adult"; // Ages 18+

export type ViolenceLevel = "none" | "mild" | "moderate" | "graphic";

/** Subset of project settings that drive content filtering. */
export interface ContentFilterSettings {
  /** Target reader demographic (free text, e.g. "middle grade readers"). */
  targetAudience?: string;
  violenceLevel?: ViolenceLevel;
  /** Allow profanity. */
  profanity?: boolean;
  /** Allow mature themes. */
  matureContent?: boolean;
  /** Custom topics that must not appear in the content. */
  avoidTopics?: string[];
}

/** Generated content guidelines based on settings. */
export interface ContentGuidelines {
  audienceLevel: AudienceLevel;
  violenceLevel: ViolenceLevel;
  violenceInstruction: string;
  profanityInstruction: string;
  matureContentInstruction: string;
  vocabularyLevel: string;
  themesInstruction: string;
  avoidTopics: string[];
}

/** Violence level descriptions for each audience. */
export const VIOLENCE_GUIDELINES: Record<AudienceLevel, Partial<Record<ViolenceLevel, string>>> = {
  children: {
    none: "No violence of any kind. Conflicts should be resolved peacefully.",
    mild: "Only very mild cartoon-style conflict allowed. No injury or harm.",
  },
  middle_grade: {
    none: "No violence. Focus on emotional and intellectual conflicts.",
    mild: "Minor conflict is acceptable (pushing, chasing). No injury or blood.",
    moderate:
      "Some physical conflict allowed, but no graphic descriptions. " +
      "Injuries are mentioned briefly without detail.",
  },
  young_adult: {
    none: "Avoid violence. Use tension and suspense without physical harm.",
    mild: "Minor conflict allowed. Keep violence off-page when possible.",
    moderate: "Moderate action is acceptable. Avoid graphic injury details.",
    graphic: "Action and conflict allowed but maintain some restraint " + "in describing injuries.",
  },
  adult: {
    none: "Minimize violence. Focus on psychological tension.",
    mild: "Brief, non-graphic violence is acceptable.",
    moderate: "Realistic violence allowed with reasonable detail.",
    graphic: "Graphic violence allowed within story context. " + "Avoid gratuitous violence.",
  },
};

/** Profanity guidelines for each audience, keyed by whether profanity is allowed. */
export const PROFANITY_GUIDELINES: Record<AudienceLevel, { allowed: string; disallowed: string }> =
  {
    children: {
      allowed: "Use only mild exclamations (oh no, darn, heck). No actual profanity.",
      disallowed: "No profanity or crude language of any kind.",
    },
    middle_grade: {
      allowed: "Mild swearing only (damn, hell). No strong profanity.",
      disallowed: "No profanity. Use character-appropriate exclamations.",
    },
    young_adult: {
      allowed: "Moderate profanity acceptable. Avoid excessive use.",
      disallowed: "No profanity. Express strong emotion without swearing.",
    },
    adult: {
      allowed: "Profanity allowed naturally in dialogue and narration.",
      disallowed: "No profanity even for adult audiences.",
    },
  };

/** Mature content guidelines, keyed by whether mature content is allowed. */
export const MATURE_CONTENT_GUIDELINES: Record<
  AudienceLevel,
  { allowed: string; disallowed: string }
> = {
  children: {
    allowed: "No mature themes. Keep content age-appropriate for ages 6-10.",
    disallowed: "No mature themes. Keep content age-appropriate for ages 6-10.",
  },
  middle_grade: {
    allowed:
      "Age-appropriate themes only. Handle serious topics sensitively " +
      "without explicit detail.",
    disallowed: "Keep themes light and age-appropriate for ages 10-14.",
  },
  young_adult: {
    allowed:
      "Mature themes (relationships, identity, loss) allowed with " +
      "restraint. No explicit sexual content.",
    disallowed: "Handle mature topics carefully. Fade to black for any " + "romantic intimacy.",
  },
  adult: {
    allowed: "Mature themes allowed including complex relationships and " + "adult situations.",
    disallowed: "Handle mature themes with discretion. No explicit content.",
  },
};

/** Vocabulary level by audience. */
export const VOCABULARY_LEVELS: Record<AudienceLevel, string> = {
  children:
    "Use simple, clear vocabulary. Short sentences. " +
    "Avoid complex words - explain any unfamiliar terms through context.",
  middle_grade:
    "Use age-appropriate vocabulary. Introduce some challenging words " +
    "with context clues. Keep sentence structure varied but accessible.",
  young_adult:
    "Use rich vocabulary suitable for teens. Complex sentence structures " +
    "are acceptable. Match vocabulary to character and genre.",
  adult: "Full vocabulary range available. Match complexity to genre and " + "character voice.",
};

/** Theme guidelines by audience. */
export const THEME_GUIDELINES: Record<AudienceLevel, string> = {
  children:
    "Focus on friendship, family, adventure, discovery, and overcoming " +
    "fears. Positive resolutions. Good triumphs over challenges.",
  middle_grade:
    "Themes of identity, friendship, family dynamics, school challenges. " +
    "Characters can face real problems but with hope and resolution.",
  young_adult:
    "Complex themes including identity, relationships, moral ambiguity, " +
    "social issues. Characters face real consequences but stories have " +
    "meaningful conclusions.",
  adult:
    "Full thematic range. Complex moral questions, nuanced characters, " +
    "realistic consequences. Themes can be dark or challenging.",
};

/** Topics automatically added to the avoid list for children. */
export const CHILDREN_AUTO_AVOID_TOPICS: readonly string[] = [
  "death of main characters",
  "graphic injury",
  "romantic relationships",
  "substance abuse",
  "adult situations",
];

/** Topics automatically added to the avoid list for middle grade. */
export const MIDDLE_GRADE_AUTO_AVOID_TOPICS: readonly string[] = [
  "explicit violence",
  "substance abuse",
  "explicit romantic content",
];

const CHILDREN_INDICATORS = ["child", "kid", "6-10", "7-10", "8-10", "elementary", "grade school"];

const MIDDLE_GRADE_INDICATORS = [
  "middle grade",
  "middle-grade",
  "tween",
  "10-14",
  "11-14",
  "middle school",
  "preteen",
];

const YOUNG_ADULT_INDICATORS = [
  "young adult",
  "ya",
  "teen",
  "14-18",
  "15-18",
  "high school",
  "adolescent",
];

/** Parse a free-text target audience string into an AudienceLevel. */
export function parseTargetAudience(targetAudience: string): AudienceLevel {
  const audienceLower = targetAudience.toLowerCase();

  if (CHILDREN_INDICATORS.some((term) => audienceLower.includes(term))) {
    return "children";
  }
  if (MIDDLE_GRADE_INDICATORS.some((term) => audienceLower.includes(term))) {
    return "middle_grade";
  }
  if (YOUNG_ADULT_INDICATORS.some((term) => audienceLower.includes(term))) {
    return "young_adult";
  }
  return "adult";
}

/**
 * Generate content guidelines from project settings.
 * Defaults mirror the original ProjectSettings schema: target audience
 * "general adult", violence "mild", no profanity, no mature content.
 */
export function generateContentGuidelines(settings: ContentFilterSettings): ContentGuidelines {
  const audience = parseTargetAudience(settings.targetAudience ?? "general adult");

  // Clamp violence level for younger audiences.
  const violenceOptions = VIOLENCE_GUIDELINES[audience];
  let violenceLevel: ViolenceLevel = settings.violenceLevel ?? "mild";
  if (audience === "children" && violenceOptions[violenceLevel] === undefined) {
    violenceLevel = "mild";
  } else if (audience === "middle_grade" && violenceLevel === "graphic") {
    violenceLevel = "moderate";
  }
  const violenceInstruction = violenceOptions[violenceLevel] ?? violenceOptions.mild ?? "";

  // Children never get profanity even if set to true.
  const allowProfanity = (settings.profanity ?? false) && audience !== "children";
  const profanityInstruction =
    PROFANITY_GUIDELINES[audience][allowProfanity ? "allowed" : "disallowed"];

  // Children never get mature content.
  const allowMature = (settings.matureContent ?? false) && audience !== "children";
  const matureContentInstruction =
    MATURE_CONTENT_GUIDELINES[audience][allowMature ? "allowed" : "disallowed"];

  const vocabularyLevel = VOCABULARY_LEVELS[audience];
  const themesInstruction = THEME_GUIDELINES[audience];

  // Compile avoid topics, adding automatic topics for younger audiences.
  const avoidTopics = [...(settings.avoidTopics ?? [])];
  const autoAvoid =
    audience === "children"
      ? CHILDREN_AUTO_AVOID_TOPICS
      : audience === "middle_grade"
        ? MIDDLE_GRADE_AUTO_AVOID_TOPICS
        : [];
  for (const topic of autoAvoid) {
    if (!avoidTopics.includes(topic)) {
      avoidTopics.push(topic);
    }
  }

  return {
    audienceLevel: audience,
    violenceLevel,
    violenceInstruction,
    profanityInstruction,
    matureContentInstruction,
    vocabularyLevel,
    themesInstruction,
    avoidTopics,
  };
}

/** "middle_grade" -> "Middle Grade" (mirrors Python's .replace('_',' ').title()). */
function audienceTitle(audience: AudienceLevel): string {
  return audience
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Convert guidelines to a prompt section for the writer agent. */
export function contentGuidelinesToPromptSection(guidelines: ContentGuidelines): string {
  const sections = [
    "## Content Guidelines",
    "",
    `**Target Audience:** ${audienceTitle(guidelines.audienceLevel)}`,
    "",
    "### Content Restrictions",
    `- **Violence:** ${guidelines.violenceInstruction}`,
    `- **Language:** ${guidelines.profanityInstruction}`,
    `- **Mature Themes:** ${guidelines.matureContentInstruction}`,
    "",
    "### Writing Style",
    `- **Vocabulary:** ${guidelines.vocabularyLevel}`,
    `- **Themes:** ${guidelines.themesInstruction}`,
  ];

  if (guidelines.avoidTopics.length > 0) {
    sections.push(
      "",
      "### Topics to Avoid",
      "The following topics must NOT appear in the content:",
    );
    for (const topic of guidelines.avoidTopics) {
      sections.push(`- ${topic}`);
    }
  }

  sections.push(
    "",
    "**IMPORTANT:** These content guidelines are mandatory. " +
      "Any content that violates these restrictions will be rejected.",
  );

  return sections.join("\n");
}

/**
 * Build the content-filter prompt section from project settings.
 * Returns an empty string when no settings are provided.
 */
export function buildContentFilterPrompt(settings?: ContentFilterSettings | null): string {
  if (settings === undefined || settings === null) {
    return "";
  }
  return contentGuidelinesToPromptSection(generateContentGuidelines(settings));
}
