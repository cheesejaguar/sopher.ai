import { getDb, schema } from "@/db";
import type { ModerationVerdict } from "@/ai/schemas";

/**
 * Records a quiet moderation flag. Never throws — a moderation bookkeeping
 * failure must not fail the writing pipeline — and never surfaces anything to
 * the author. Flags are reviewed in the admin dashboard only.
 */
export async function recordModerationFlag(input: {
  projectId: string;
  source: "brief" | "chapter";
  chapterNumber?: number;
  verdict: ModerationVerdict;
}): Promise<void> {
  const { verdict } = input;
  if (!verdict.flagged) return;
  try {
    await getDb()
      .insert(schema.moderationFlags)
      .values({
        projectId: input.projectId,
        chapterNumber: input.chapterNumber,
        source: input.source,
        category: verdict.category ?? "other",
        // Minors always escalates — and so does a flag with NO category, since
        // an unclassified flag cannot rule the worst case out. An explicit
        // "other" stays ordinary review.
        severity: verdict.category === "minors" || !verdict.category ? "urgent" : "review",
        excerpt: verdict.excerpt?.slice(0, 500),
        detail: verdict.reason?.slice(0, 300),
      });
  } catch (error) {
    console.warn("[moderation] flag write failed:", error);
  }
}

/** The prompt fragment shared by the concept and summarizer calls. */
export const MODERATION_PROMPT = [
  `Separately, set the moderation field: flag ONLY if the text contains sexual content involving minors (category "minors"), non-consensual sexual content presented approvingly ("nonconsent"), sexual or defamatory content about real identifiable people ("real_person"), incitement or glorification of real-world violence or hatred against protected groups ("hate_incitement"), or instructions facilitating self-harm ("self_harm").`,
  `Fictional violence, dark themes, and explicit adult content between adults are NOT flags — this is a fiction product with author-controlled content settings. When flagged, quote the shortest relevant excerpt and state the reason in one sentence.`,
].join(" ");
