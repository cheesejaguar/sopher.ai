import { GENRE_IDS, type GenreId } from "@/ai/knowledge/genres";
import { VOICE_PROFILE_IDS } from "@/ai/knowledge/voice-profiles";
import {
  CUSTOM_GENRE,
  MAX_CHAPTERS,
  MAX_CUSTOM_GENRE_LENGTH,
  MAX_WORDS_PER_CHAPTER,
  MIN_CHAPTERS,
  minWordsForGenre,
  type AuthoringMode,
  type HeatLevel,
  type Pov,
  type ProfanityLevel,
  type Tense,
  type ViolenceLevel,
  type WizardState,
} from "@/components/wizard/wizard-state";
import type { QualityTier } from "@/ai/models";
import type { ProjectExperience, ProjectSettings } from "@/db/schema";

/**
 * The only columns "start another book from this one" reads.
 *
 * Written as an explicit shape rather than the project row so the set of
 * carried columns is a decision made here, in one place, instead of whatever
 * the caller happened to select. Chapters, runs, credits, status and
 * completedAt are not in it and cannot be: nothing is inserted — the author
 * lands back in the wizard with these answers pre-filled.
 */
export type CarryForwardSource = {
  title: string;
  brief: string | null;
  genre: string | null;
  subgenre: string | null;
  protagonist: string | null;
  setting: string | null;
  experience: ProjectExperience;
  targetChapters: number;
  targetWordsPerChapter: number;
  settings: ProjectSettings | null;
};

// `settings` is jsonb, so its runtime contents are whatever an older release
// (or a hand-edited row) put there. Each value is checked against the wizard's
// own union before it is allowed back into wizard state.
const POV_VALUES = ["first", "third_limited", "third_omniscient"] as const satisfies readonly Pov[];
const TENSE_VALUES = ["past", "present"] as const satisfies readonly Tense[];
const HEAT_VALUES = [
  "none",
  "mild",
  "moderate",
  "explicit",
] as const satisfies readonly HeatLevel[];
const VIOLENCE_VALUES = [
  "none",
  "mild",
  "moderate",
  "graphic",
] as const satisfies readonly ViolenceLevel[];
const PROFANITY_VALUES = [
  "none",
  "mild",
  "moderate",
  "strong",
] as const satisfies readonly ProfanityLevel[];
const AUTHORING_MODE_VALUES = ["guided", "autopilot"] as const satisfies readonly AuthoringMode[];
const TIER_VALUES = ["draft", "standard", "premium"] as const satisfies readonly QualityTier[];

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function clampInt(value: number, min: number, max: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * The brief the author typed, recovered from the brief the agents were given.
 *
 * `composeBrief` folds subgenre, protagonist and setting onto the end as
 * English before the project is stored, so carrying the stored text straight
 * back would duplicate those lines the moment the wizard composed it again.
 */
function editableBrief(source: {
  brief: string | null;
  subgenre: string | null;
  protagonist: string | null;
  setting: string | null;
}): string {
  const brief = source.brief?.trim() ?? "";
  const extras: string[] = [];
  if (source.subgenre) extras.push(`Subgenre: ${source.subgenre}.`);
  if (source.protagonist?.trim()) extras.push(`Protagonist: ${source.protagonist.trim()}.`);
  if (source.setting?.trim()) extras.push(`Setting: ${source.setting.trim()}.`);
  if (extras.length === 0) return brief;
  const suffix = `\n\n${extras.join("\n")}`;
  return brief.endsWith(suffix) ? brief.slice(0, -suffix.length).trimEnd() : brief;
}

/**
 * A stored genre is a free string — the catalog id for a catalog book, the
 * author's own words for anything the catalog does not cover. The wizard has
 * no control for arbitrary text, so a non-catalog genre must come back through
 * the CUSTOM_GENRE sentinel or Step 1 would silently drop it.
 */
function carriedGenre(genre: string | null): Pick<WizardState, "genre" | "customGenre"> {
  const raw = genre?.trim() ?? "";
  if (raw.length === 0) return { genre: null, customGenre: "" };
  if ((GENRE_IDS as readonly string[]).includes(raw)) {
    return { genre: raw as GenreId, customGenre: "" };
  }
  return { genre: CUSTOM_GENRE, customGenre: raw.slice(0, MAX_CUSTOM_GENRE_LENGTH) };
}

/**
 * Turns a project the caller owns into the wizard answers for a new book.
 *
 * Every field is optional in the result: a key that is absent keeps the
 * wizard's own default, whereas a key set to `undefined` would overwrite that
 * default when the wizard spreads this over `initialWizardState`. Unreadable
 * settings are therefore omitted, never blanked.
 */
export function projectCarryForwardSetup(source: CarryForwardSource): Partial<WizardState> {
  const { genre, customGenre } = carriedGenre(source.genre);
  const settings = source.settings ?? {};

  const pov = oneOf(POV_VALUES, settings.pov);
  const tense = oneOf(TENSE_VALUES, settings.tense);
  const heatLevel = oneOf(HEAT_VALUES, settings.heatLevel);
  const violenceLevel = oneOf(VIOLENCE_VALUES, settings.violenceLevel);
  const profanity = oneOf(PROFANITY_VALUES, settings.profanity);
  const authoringMode = oneOf(AUTHORING_MODE_VALUES, settings.authoringMode);
  const voiceProfile = oneOf(VOICE_PROFILE_IDS, settings.voiceProfile);
  const tier = oneOf(TIER_VALUES, settings.qualityTier);

  // The included story's 3 × 1,000 production shape is a server-owned
  // constraint rather than an authored choice — carrying it would open a
  // "full-length" setup at six thousand words. Only a full book's own shape is
  // worth carrying, clamped to what the shape step can actually display.
  const fullBookSource = source.experience === "full_book";
  const chapters = fullBookSource
    ? clampInt(source.targetChapters, MIN_CHAPTERS, MAX_CHAPTERS)
    : undefined;
  const wordsPerChapter = fullBookSource
    ? clampInt(source.targetWordsPerChapter, minWordsForGenre(genre), MAX_WORDS_PER_CHAPTER)
    : undefined;

  return {
    title: source.title,
    brief: editableBrief(source),
    genre,
    customGenre,
    subgenre: source.subgenre,
    protagonist: source.protagonist ?? "",
    setting: source.setting ?? "",
    ...(chapters !== undefined ? { chapters } : {}),
    ...(wordsPerChapter !== undefined ? { wordsPerChapter } : {}),
    ...(pov ? { pov } : {}),
    ...(tense ? { tense } : {}),
    ...(heatLevel ? { heatLevel } : {}),
    ...(violenceLevel ? { violenceLevel } : {}),
    ...(profanity ? { profanity } : {}),
    ...(authoringMode ? { authoringMode } : {}),
    ...(voiceProfile ? { voiceProfile } : {}),
    ...(tier ? { tier } : {}),
    ...(typeof settings.requireOutlineApproval === "boolean"
      ? { requireOutlineApproval: settings.requireOutlineApproval }
      : {}),
  };
}
