import type { schema } from "@/db";
import type { GenerationConfig } from "@/lib/run-events";
import { TRIAL_STORY_CONFIG } from "@/lib/trial-story";

export type BookGenerationSnapshot = Pick<
  typeof schema.projects.$inferSelect,
  | "title"
  | "brief"
  | "genre"
  | "styleGuide"
  | "targetChapters"
  | "targetWordsPerChapter"
  | "settings"
  | "experience"
>;

export type StartableProject = BookGenerationSnapshot &
  Pick<typeof schema.projects.$inferSelect, "id" | "updatedAt">;

export type ChapterRegenerationTarget = {
  chapterId: string;
  chapterNumber: number;
};

/**
 * A wizard start may only reattach to the full-book run it is responsible for.
 * Chapter regeneration and editorial passes share the project's active-run
 * exclusion lock, but they are not valid destinations for the book-start UI.
 */
export function canReattachBookStart(
  kind: typeof schema.generationRuns.$inferSelect.kind,
): kind is "full_book" {
  return kind === "full_book";
}

/** Builds the immutable run snapshot from persisted, server-authoritative data. */
export function buildBookGenerationConfig(project: BookGenerationSnapshot): GenerationConfig {
  const trial = project.experience === "trial_short_story";
  return {
    protocolVersion: 2,
    productionMode: project.experience,
    tier: trial ? TRIAL_STORY_CONFIG.tier : (project.settings.qualityTier ?? "standard"),
    requireOutlineApproval: trial
      ? TRIAL_STORY_CONFIG.requireOutlineApproval
      : (project.settings.requireOutlineApproval ?? true),
    waveSize: trial ? TRIAL_STORY_CONFIG.waveSize : 4,
    targetChapters: trial ? TRIAL_STORY_CONFIG.targetChapters : project.targetChapters,
    targetWordsPerChapter: trial
      ? TRIAL_STORY_CONFIG.targetWordsPerChapter
      : project.targetWordsPerChapter,
    inputSnapshot: {
      workingTitle: project.title,
      brief: project.brief ?? "",
      genre: project.genre ?? null,
      styleGuide: project.styleGuide ?? null,
      voiceProfile: project.settings.voiceProfile ?? null,
      pov: project.settings.pov ?? null,
      tense: project.settings.tense ?? null,
      tone: project.settings.tone ?? null,
      styleProfile: project.settings.styleProfile ?? null,
      heatLevel: project.settings.heatLevel ?? null,
      violenceLevel: project.settings.violenceLevel ?? null,
      profanity: project.settings.profanity ?? null,
      avoidTopics: [...(project.settings.avoidTopics ?? [])],
    },
  };
}

/** Uses the same frozen identity/entitlement while narrowing work to one chapter. */
export function buildChapterRegenerationConfig(
  project: BookGenerationSnapshot,
  target?: ChapterRegenerationTarget,
): GenerationConfig {
  return {
    ...buildBookGenerationConfig(project),
    requireOutlineApproval: false,
    waveSize: 1,
    chapterRegeneration: true,
    ...(target ? { chapterRegenerationTarget: target } : {}),
  };
}

/** A caller-stable key may reattach only to the exact chapter it originally targeted. */
export function canReattachChapterRegeneration(
  config: unknown,
  target: ChapterRegenerationTarget,
): boolean {
  if (!config || typeof config !== "object") return false;
  const candidate = config as Partial<GenerationConfig>;
  return (
    candidate.chapterRegeneration === true &&
    candidate.chapterRegenerationTarget?.chapterId === target.chapterId &&
    candidate.chapterRegenerationTarget.chapterNumber === target.chapterNumber
  );
}
