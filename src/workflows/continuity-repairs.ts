import type { ContinuityOutcome } from "@/ai/agents/continuity";

export type ContinuityChapterRepair = {
  chapterNumber: number;
  issueNotes: string;
};

export type ContinuityRepairProgress = {
  processedChapterCount: number;
  appliedChapterCount: number;
  unresolvedChapterCount: number;
  detail: string;
};

/** Truthful author copy derived only from persisted edit results. */
export function continuityRepairProgress(
  processedChapterCount: number,
  appliedChapterCount: number,
): ContinuityRepairProgress {
  const processed = Math.max(0, Math.trunc(processedChapterCount));
  const applied = Math.min(processed, Math.max(0, Math.trunc(appliedChapterCount)));
  const unresolved = processed - applied;
  return {
    processedChapterCount: processed,
    appliedChapterCount: applied,
    unresolvedChapterCount: unresolved,
    detail: `${applied} ${applied === 1 ? "chapter" : "chapters"} changed automatically; ${unresolved} ${unresolved === 1 ? "chapter needs" : "chapters need"} author review`,
  };
}

export function continuityRevisionStatus(
  current: "planned" | "drafting" | "drafted" | "edited" | "final",
): "edited" | "final" {
  return current === "final" ? "final" : "edited";
}

const AMBIGUOUS_FINDING =
  /\b(?:might|may be|could be|possibly|potentially|appears to|unclear whether|if intentional|if this is intentional)\b/i;
const NON_ACTIONABLE_FIX =
  /^\s*(?:verify|confirm|double[- ]check|check(?: whether)?|consider|review|decide whether|ensure|make sure)\b/i;
const NO_CHANGE_FIX = /\b(?:no change|leave (?:it|this) unchanged)\b/i;
const CONDITIONAL_FIX =
  /\b(?:if|unless|depending on|either\b|alternatively|author(?:'s)? intent|choose between)\b/i;
export const AUTO_REPAIR_CONFIDENCE = 0.85;

/**
 * A review note is safe to hand to the revision agent only when the technical
 * pass described a concrete inconsistency and proposed a concrete resolution.
 * Hedged observations remain useful report notes, but they must never spend
 * credits or mutate prose merely to "verify" something.
 */
export function isConfirmedTechnicalContinuityIssue(
  issue: ContinuityOutcome["result"]["issues"][number],
): boolean {
  const fix = issue.suggestedFix.trim();
  if (issue.fixability !== "auto_fixable") return false;
  if (!Number.isFinite(issue.confidence) || issue.confidence < AUTO_REPAIR_CONFIDENCE) return false;
  if (
    !Array.isArray(issue.chapters) ||
    !Array.isArray(issue.repairChapters) ||
    issue.chapters.length === 0 ||
    issue.repairChapters.length === 0 ||
    fix.length === 0
  ) {
    return false;
  }
  if (AMBIGUOUS_FINDING.test(issue.description) || CONDITIONAL_FIX.test(issue.description)) {
    return false;
  }
  if (NON_ACTIONABLE_FIX.test(fix) || NO_CHANGE_FIX.test(fix) || CONDITIONAL_FIX.test(fix)) {
    return false;
  }
  return true;
}

/**
 * Turns confirmed technical findings into chapter-local revision briefs.
 *
 * The continuity report itself keeps every phase and every ambiguous note.
 * This narrower projection is mutation authority: only the technical pass can
 * authorize a rewrite, and each chapter sees only findings that cite it.
 */
export function buildContinuityChapterRepairs(input: {
  outcomes: readonly ContinuityOutcome[];
  targetChapters: number;
  writtenChapterNumbers: readonly number[];
}): ContinuityChapterRepair[] {
  const written = new Set(
    input.writtenChapterNumbers.filter(
      (chapterNumber) =>
        Number.isSafeInteger(chapterNumber) &&
        chapterNumber >= 1 &&
        chapterNumber <= input.targetChapters,
    ),
  );
  const byChapter = new Map<number, string[]>();
  const technical = input.outcomes.find((outcome) => outcome.key === "technical_consistency");
  if (!technical) return [];

  for (const issue of technical.result.issues) {
    if (!isConfirmedTechnicalContinuityIssue(issue)) continue;
    const evidence = new Set(issue.chapters);
    const affected = [...new Set(issue.repairChapters)].sort((left, right) => left - right);
    // Mutation authority is fail-closed. Do not silently trim a malformed
    // target list and apply only part of a model-proposed repair: every target
    // must be cited as evidence and must still be a written chapter in scope.
    if (
      affected.length === 0 ||
      affected.some((chapterNumber) => !evidence.has(chapterNumber) || !written.has(chapterNumber))
    ) {
      continue;
    }
    const evidenceChapters = [...new Set(issue.chapters)].sort((left, right) => left - right);

    for (const chapterNumber of affected) {
      const notes = byChapter.get(chapterNumber) ?? [];
      notes.push(
        [
          `[${issue.severity} ${issue.category} continuity error evidenced by chapters ${evidenceChapters.join(", ")}]`,
          issue.description.trim(),
          `Required resolution: ${issue.suggestedFix.trim()}`,
          `Chapter ${chapterNumber} was explicitly identified as containing incorrect prose. Change only the prose needed for this resolution; return no replacement if the evidence no longer supports the change.`,
        ].join("\n"),
      );
      byChapter.set(chapterNumber, notes);
    }
  }

  return [...byChapter.entries()]
    .sort(([left], [right]) => left - right)
    .map(([chapterNumber, notes]) => ({
      chapterNumber,
      issueNotes: [
        "Apply these confirmed continuity corrections with targeted replacements. Do not rewrite unrelated prose and do not emit no-op replacements.",
        ...notes,
      ].join("\n\n"),
    }));
}
