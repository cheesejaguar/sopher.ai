import { describe, expect, it } from "vitest";

import { countSavedAuthoringCheckpoints } from "@/lib/run-health";
import type { GenerationConfig } from "@/lib/run-events";

import {
  chapterWorkCheckpointCount,
  contentDigest,
  dropCompletedRunWork,
  editOutputAlreadyApplied,
  pruneChapterWork,
  pruneEditWork,
  reusableEditWork,
  type ChapterWork,
  type EditWork,
} from "./work-state";

const PROSE = "The harbor smelled of salt and cold iron.";
const EDITED = "Salt and cold iron rode the harbor wind.";

const fullChapterWork: ChapterWork = {
  scenePlan: { scenes: [], openingHookApproach: "a", closingHookApproach: "b" },
  draft: PROSE,
  critique: { verdict: "pass", score: 0.9, issues: [] },
  summary: {
    contentDigest: contentDigest(PROSE),
    result: { summary: "Mira reaches the harbor." } as never,
  },
  result: { content: PROSE, wordCount: 8, qualityScore: 0.9, critique: null },
};

const fullEdit: EditWork = {
  baseContentDigest: contentDigest(PROSE),
  content: EDITED,
  changed: true,
  notes: ["Tightened the opening"],
};

describe("pruneChapterWork", () => {
  it("drops every text-bearing checkpoint once the chapter row holds the prose", () => {
    const pruned = pruneChapterWork(fullChapterWork, contentDigest(PROSE));
    expect(pruned).toEqual({
      persisted: { contentDigest: contentDigest(PROSE), checkpointCount: 5 },
    });
    expect(JSON.stringify(pruned)).not.toContain("salt");
  });

  it("never creates work for a chapter that had none", () => {
    expect(pruneChapterWork(undefined, contentDigest(PROSE))).toBeUndefined();
  });

  it("keeps the checkpoint count when a pruned chapter is rewritten and pruned again", () => {
    const first = pruneChapterWork(fullChapterWork, contentDigest(PROSE));
    const rewritten = {
      ...first,
      draft: EDITED,
      result: { ...fullChapterWork.result!, content: EDITED },
    };
    expect(chapterWorkCheckpointCount(pruneChapterWork(rewritten, contentDigest(EDITED)))).toBe(7);
  });

  it("keeps the saved-checkpoint total the author sees from shrinking", () => {
    const before: GenerationConfig = {
      work: { chapters: { "1": fullChapterWork } },
    } as unknown as GenerationConfig;
    const after: GenerationConfig = {
      work: { chapters: { "1": pruneChapterWork(fullChapterWork, contentDigest(PROSE))! } },
    } as unknown as GenerationConfig;
    expect(countSavedAuthoringCheckpoints(after)).toBe(countSavedAuthoringCheckpoints(before));
  });
});

describe("edit work pruning and fallback", () => {
  it("replaces an applied edit's text with its digest", () => {
    expect(pruneEditWork(fullEdit)).toEqual({
      baseContentDigest: fullEdit.baseContentDigest,
      contentDigest: contentDigest(EDITED),
      changed: true,
      notes: fullEdit.notes,
    });
  });

  it("leaves an already pruned entry alone", () => {
    const pruned = pruneEditWork(fullEdit);
    expect(pruneEditWork(pruned)).toBe(pruned);
  });

  it("still recognizes a pruned edit as applied by its digest", () => {
    const pruned = pruneEditWork(fullEdit);
    expect(editOutputAlreadyApplied(EDITED, pruned)).toBe(true);
    expect(editOutputAlreadyApplied(PROSE, pruned)).toBe(false);
    // Full blobs from older deployments compare text directly.
    expect(editOutputAlreadyApplied(EDITED, fullEdit)).toBe(true);
  });

  it("never offers a pruned change for re-application — there is no text to apply", () => {
    expect(reusableEditWork(pruneEditWork(fullEdit))).toBeUndefined();
    expect(reusableEditWork(fullEdit)).toBe(fullEdit);
  });

  it("keeps a pruned no-op edit reusable, since it needs no text", () => {
    const noop = pruneEditWork({ ...fullEdit, content: PROSE, changed: false });
    expect(reusableEditWork(noop)).toBe(noop);
  });
});

describe("dropCompletedRunWork", () => {
  it("drops chapter and edit work but keeps small provenance", () => {
    const config = {
      tier: "standard",
      work: {
        conceptExpanded: { title: "The Map of Tides" },
        chapters: { "1": fullChapterWork },
        edits: { "editorial:1": fullEdit },
      },
      completion: { finalized: { sourceRunId: "run-1", manuscriptDigest: "d" } },
    } as unknown as GenerationConfig;

    const dropped = dropCompletedRunWork(config);

    expect(dropped.work).toEqual({ conceptExpanded: { title: "The Map of Tides" } });
    expect(dropped.completion).toBe(config.completion);
  });
});
