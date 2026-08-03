import type { GenreId } from "@/ai/knowledge/genres";
import type { VoiceProfileId } from "@/ai/knowledge/voice-profiles";
import type { QualityTier } from "@/ai/models";
import { TRIAL_STORY_CONFIG, type ProjectExperience } from "@/lib/trial-story";

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
  genre: GenreId | null;
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

/** Whether the given step has everything it needs to move forward. */
export function stepComplete(state: WizardState, step: number): boolean {
  switch (WIZARD_STEPS[step]?.id) {
    case "genre":
      return state.genre !== null;
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
    merged.wordsPerChapter = Math.min(
      Math.max(merged.wordsPerChapter, MIN_WORDS_PER_CHAPTER),
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
