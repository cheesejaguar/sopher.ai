import { TRIAL_STORY_CONFIG } from "@/lib/trial-story";

/** Public wording shared by visible pages, metadata, JSON-LD, and llms.txt. */
export const INCLUDED_STORY_OFFER = "Create one complete short story—no card required";

export const INCLUDED_STORY_DESCRIPTION =
  `Every eligible verified account includes a ${TRIAL_STORY_CONFIG.targetChapters}-chapter, ` +
  `${TRIAL_STORY_CONFIG.targetWordsPerChapter.toLocaleString("en-US")}-word-per-chapter story ` +
  "at Standard quality, with outline approval and the complete Studio, editor, story bible, manuscript, and export experience.";

/** Product-language contract for the optional step after the included story. */
export const FULL_BOOK_UNLOCK_DESCRIPTION =
  "One settled credit purchase permanently unlocks full-length chapter count, length, and quality controls.";

export const INCLUDED_STORY_NO_CARD_NOTE =
  `Your included ${TRIAL_STORY_CONFIG.targetChapters}-chapter, ` +
  `${TRIAL_STORY_CONFIG.targetWordsPerChapter.toLocaleString("en-US")}-word-per-chapter story ` +
  "does not require a card.";

export const INCLUDED_STORY_WAVE_DESCRIPTION =
  `The included story drafts ${TRIAL_STORY_CONFIG.waveSize} ${
    TRIAL_STORY_CONFIG.waveSize === 1 ? "chapter" : "chapters"
  } at a time; ` + "full-length books can draft up to four chapters in a coordinated wave.";

/** Carries the buyer through Stripe and back into a fresh full-book setup. */
export const FULL_BOOK_UNLOCK_HREF = "/studio/credits?return=%2Fstudio%2Fnew" as const;

/**
 * Preserve the included story's identity through checkout without pretending
 * the fixed trial project itself changes shape. The returned full-book wizard
 * verifies ownership before carrying over the title, genre, and brief.
 */
export function fullBookSetupHref(sourceProjectId: string): `/studio/new?from=${string}` {
  return `/studio/new?from=${encodeURIComponent(sourceProjectId)}`;
}

export function fullBookUnlockHref(sourceProjectId: string): `/studio/credits?return=${string}` {
  return `/studio/credits?return=${encodeURIComponent(fullBookSetupHref(sourceProjectId))}`;
}
