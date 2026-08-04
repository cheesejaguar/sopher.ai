import {
  GENRE_TEMPLATES,
  genreAudience,
  type GenreAudience,
  type GenreId,
} from "@/ai/knowledge/genres";
import type { VoiceProfileId } from "@/ai/knowledge/voice-profiles";
import type { QualityTier } from "@/ai/models";
import { TRIAL_STORY_CONFIG, type ProjectExperience } from "@/lib/trial-story";

/**
 * Sentinel for "my book is not one of these". The catalog covers the common
 * cases, but an author arriving with a western, a cookbook, or a book of
 * verse used to hit a wall here — there was no way past the genre step at all.
 * The value is never persisted; `resolvedGenre` swaps in the author's own words.
 */
export const CUSTOM_GENRE = "custom" as const;

export type WizardGenre = GenreId | typeof CUSTOM_GENRE;

/** Short enough to type, long enough to mean something to the concept agent. */
export const MIN_CUSTOM_GENRE_LENGTH = 3;
export const MAX_CUSTOM_GENRE_LENGTH = 60;

export type Pov = "first" | "third_limited" | "third_omniscient";
export type Tense = "past" | "present";
export type HeatLevel = "none" | "mild" | "moderate" | "explicit";
export type ViolenceLevel = "none" | "mild" | "moderate" | "graphic";
export type ProfanityLevel = "none" | "mild" | "moderate" | "strong";
export type AuthoringMode = "guided" | "autopilot";

export const WIZARD_STEPS = [
  { id: "genre", label: "Genre" },
  { id: "brief", label: "Brief" },
  { id: "shape", label: "Shape" },
  { id: "estimate", label: "Estimate" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export const MIN_CHAPTERS = 6;
export const MAX_CHAPTERS = 40;
export const MIN_WORDS_PER_CHAPTER = 1_000;
export const MAX_WORDS_PER_CHAPTER = 6_000;
export const MIN_BRIEF_LENGTH = 20;
export const MIN_TITLE_LENGTH = 1;

/**
 * The shortest chapter each audience can be asked for.
 *
 * A children's chapter is meant to be about five minutes read aloud. Holding
 * every genre to the adult 1,000-word floor produced children's books no child
 * could sit through, so the floor follows the reader rather than the product.
 */
const AUDIENCE_MIN_WORDS: Record<GenreAudience, number> = {
  // Kept on the slider's 250-word step grid so every draggable position is a
  // round number and each genre's default sits exactly on one.
  children: 500,
  middle_grade: 750,
  young_adult: MIN_WORDS_PER_CHAPTER,
  adult: MIN_WORDS_PER_CHAPTER,
};

/** Lowest words-per-chapter the shape step will offer for this genre. */
export function minWordsForGenre(genre: WizardGenre | null): number {
  if (!genre || genre === CUSTOM_GENRE) return MIN_WORDS_PER_CHAPTER;
  return AUDIENCE_MIN_WORDS[genreAudience(genre)];
}

/**
 * Chapter count and length a genre should start at.
 *
 * Only the genres that carry explicit defaults move the sliders; the original
 * seven have none, so choosing Romance leaves an author's existing numbers
 * exactly where they were.
 */
export function shapeDefaultsForGenre(
  genre: WizardGenre | null,
): { chapters: number; wordsPerChapter: number } | null {
  if (!genre || genre === CUSTOM_GENRE) return null;
  const template = GENRE_TEMPLATES[genre];
  if (!template?.defaultChapters || !template.defaultWordsPerChapter) return null;
  return {
    chapters: Math.min(Math.max(template.defaultChapters, MIN_CHAPTERS), MAX_CHAPTERS),
    wordsPerChapter: Math.min(
      Math.max(template.defaultWordsPerChapter, minWordsForGenre(genre)),
      MAX_WORDS_PER_CHAPTER,
    ),
  };
}

/** Paperback pages per word — used for the page-count readout on the shape step. */
export const WORDS_PER_PAGE = 275;

/**
 * Experience-scoped localStorage keys shared between the wizard and recovery
 * surface. A retained included-story start must never become the creation key
 * for a paid full-book project after the account unlocks.
 */
export const WIZARD_DRAFT_KEY = "sopher.new-book-draft.v2";
export const WIZARD_REQUEST_KEY = "sopher.new-book-request.v2";
export const LEGACY_WIZARD_DRAFT_KEY = "sopher.new-book-draft.v1";
export const LEGACY_WIZARD_REQUEST_KEY = "sopher.new-book-request.v1";
export const DEFAULT_TIER_KEY = "sopher.default-tier.v1";

export interface WizardState {
  step: number;
  genre: WizardGenre | null;
  /** The author's own words, used only when `genre` is CUSTOM_GENRE. */
  customGenre: string;
  subgenre: string | null;
  brief: string;
  title: string;
  protagonist: string;
  setting: string;
  chapters: number;
  wordsPerChapter: number;
  voiceProfile: VoiceProfileId | "none";
  pov: Pov;
  tense: Tense;
  heatLevel: HeatLevel;
  violenceLevel: ViolenceLevel;
  profanity: ProfanityLevel;
  authoringMode: AuthoringMode;
  tier: QualityTier;
  requireOutlineApproval: boolean;
}

export const initialWizardState: WizardState = {
  step: 0,
  genre: null,
  customGenre: "",
  subgenre: null,
  brief: "",
  title: "",
  protagonist: "",
  setting: "",
  chapters: 12,
  wordsPerChapter: 3_000,
  voiceProfile: "none",
  pov: "third_limited",
  tense: "past",
  heatLevel: "none",
  violenceLevel: "mild",
  profanity: "mild",
  authoringMode: "guided",
  tier: "standard",
  requireOutlineApproval: true,
};

export type WizardActionEvent =
  | { type: "patch"; patch: Partial<WizardState> }
  | { type: "next" }
  | { type: "back" }
  | { type: "goto"; step: number }
  | { type: "restore"; state: WizardState };

function clampStep(step: number): number {
  return Math.min(Math.max(step, 0), WIZARD_STEPS.length - 1);
}

/**
 * The genre string the API and the agents actually receive.
 *
 * A canonical id for a catalog genre, or the author's own words for a custom
 * one. `projectGenreSchema` accepts any string up to 60 characters and
 * `getGenreTemplate` returns undefined for anything unrecognized, which the
 * prompt builders already treat as "no genre-specific guidance" — so a custom
 * genre degrades to a plain, well-written book rather than an error.
 */
export function resolvedGenre(state: WizardState): string | null {
  if (state.genre === null) return null;
  if (state.genre !== CUSTOM_GENRE) return state.genre;
  const custom = state.customGenre.trim();
  return custom.length >= MIN_CUSTOM_GENRE_LENGTH ? custom.slice(0, MAX_CUSTOM_GENRE_LENGTH) : null;
}

/** Whether the given step has everything it needs to move forward. */
export function stepComplete(state: WizardState, step: number): boolean {
  switch (WIZARD_STEPS[step]?.id) {
    case "genre":
      return resolvedGenre(state) !== null;
    case "brief":
      return (
        state.title.trim().length >= MIN_TITLE_LENGTH &&
        state.brief.trim().length >= MIN_BRIEF_LENGTH
      );
    case "shape":
    case "estimate":
      return true;
    default:
      return false;
  }
}

/** The furthest step the user may jump to, given current answers. */
export function maxReachableStep(state: WizardState): number {
  let reachable = 0;
  for (let step = 0; step < WIZARD_STEPS.length - 1; step += 1) {
    if (!stepComplete(state, step)) break;
    reachable = step + 1;
  }
  return reachable;
}

export function wizardReducer(state: WizardState, action: WizardActionEvent): WizardState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "next":
      if (!stepComplete(state, state.step)) return state;
      return { ...state, step: clampStep(state.step + 1) };
    case "back":
      return { ...state, step: clampStep(state.step - 1) };
    case "goto": {
      const target = clampStep(action.step);
      if (target > maxReachableStep(state)) return state;
      return { ...state, step: target };
    }
    case "restore":
      return { ...action.state, step: clampStep(action.state.step) };
    default:
      return state;
  }
}

/** Folds the optional detail fields into the brief the agents will read. */
export function composeBrief(state: WizardState): string {
  const extras: string[] = [];
  if (state.subgenre) extras.push(`Subgenre: ${state.subgenre}.`);
  if (state.protagonist.trim()) extras.push(`Protagonist: ${state.protagonist.trim()}.`);
  if (state.setting.trim()) extras.push(`Setting: ${state.setting.trim()}.`);
  const brief = state.brief.trim();
  return extras.length > 0 ? `${brief}\n\n${extras.join("\n")}` : brief;
}

/** The author-supplied working title remains the project's identity. */
export function composeTitle(state: WizardState): string {
  return state.title.trim().slice(0, 200);
}

/** Restores a persisted draft only for the production experience that saved it. */
export function restoreDraft(
  raw: string | null,
  expectedExperience: ProjectExperience,
): WizardState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as {
      v?: number;
      experience?: ProjectExperience;
      state?: Partial<WizardState>;
    };
    if (
      candidate.v !== 2 ||
      candidate.experience !== expectedExperience ||
      typeof candidate.state !== "object" ||
      candidate.state === null
    ) {
      return null;
    }
    const merged: WizardState = { ...initialWizardState, ...candidate.state };
    // Resuming restores answers, never position. Every visit begins at Step 1
    // so the author can confirm the setup before moving forward.
    merged.step = 0;
    merged.chapters = Math.min(Math.max(merged.chapters, MIN_CHAPTERS), MAX_CHAPTERS);
    // Clamp against the floor for the *restored* genre — a saved children's
    // draft at 700 words must not be silently raised to the adult minimum.
    merged.wordsPerChapter = Math.min(
      Math.max(merged.wordsPerChapter, minWordsForGenre(merged.genre)),
      MAX_WORDS_PER_CHAPTER,
    );
    return merged;
  } catch {
    return null;
  }
}

export function serializeDraft(state: WizardState, experience: ProjectExperience): string {
  return JSON.stringify({ v: 2, experience, state: { ...state, step: 0 } });
}

export function wizardDraftKey(userId: string, experience: ProjectExperience): string {
  return `${WIZARD_DRAFT_KEY}:${userId}:${experience}`;
}

export function wizardRequestKey(userId: string, experience: ProjectExperience): string {
  return `${WIZARD_REQUEST_KEY}:${userId}:${experience}`;
}

/** Remove both browser-global and account-scoped identities from the v1 wizard. */
export function clearLegacyWizardStorage(
  storage: Pick<Storage, "removeItem">,
  userId?: string,
): void {
  storage.removeItem(LEGACY_WIZARD_DRAFT_KEY);
  storage.removeItem(LEGACY_WIZARD_REQUEST_KEY);
  if (userId) {
    storage.removeItem(`${LEGACY_WIZARD_DRAFT_KEY}:${userId}`);
    storage.removeItem(`${LEGACY_WIZARD_REQUEST_KEY}:${userId}`);
  }
}

export function applyTrialStoryShape(state: WizardState): WizardState {
  return {
    ...state,
    chapters: TRIAL_STORY_CONFIG.targetChapters,
    wordsPerChapter: TRIAL_STORY_CONFIG.targetWordsPerChapter,
    tier: TRIAL_STORY_CONFIG.tier,
    requireOutlineApproval: TRIAL_STORY_CONFIG.requireOutlineApproval,
  };
}
