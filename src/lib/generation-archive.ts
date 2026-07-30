const GENERATION_RESET_SOURCE = "generation-reset";
const GENERATION_RESET_PREFIX = `${GENERATION_RESET_SOURCE}:`;

export type GenerationResetMetadata = {
  title: string | null;
  summary: string | null;
  status?: "planned" | "drafting" | "drafted" | "edited" | "final";
};

/**
 * chapter_revisions intentionally has no mutable metadata columns. Keep the
 * original title/summary in the free-form source field so a reset is fully
 * reversible without changing the persistence or public API model.
 */
export function generationResetSource(metadata: GenerationResetMetadata): string {
  return `${GENERATION_RESET_PREFIX}${encodeURIComponent(JSON.stringify(metadata))}`;
}

export function isGenerationResetSource(source: string): boolean {
  return source === GENERATION_RESET_SOURCE || source.startsWith(GENERATION_RESET_PREFIX);
}

export function shouldArchiveGenerationReset(
  chapter: { content: string; title: string | null; summary: string | null },
  retiringSurplus: boolean,
  alreadyArchived: boolean,
): boolean {
  if (alreadyArchived) return false;
  return (
    chapter.content.length > 0 ||
    (retiringSurplus && (chapter.title !== null || chapter.summary !== null))
  );
}

/** Legacy exact "generation-reset" rows restore prose with no metadata. */
export function generationResetMetadata(source: string): GenerationResetMetadata | null {
  if (!source.startsWith(GENERATION_RESET_PREFIX)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(source.slice(GENERATION_RESET_PREFIX.length))) as {
      title?: unknown;
      summary?: unknown;
      status?: unknown;
    };
    const validStatuses = new Set(["planned", "drafting", "drafted", "edited", "final"]);
    if (
      (parsed.title !== null && typeof parsed.title !== "string") ||
      (parsed.summary !== null && typeof parsed.summary !== "string") ||
      (parsed.status !== undefined &&
        (typeof parsed.status !== "string" || !validStatuses.has(parsed.status)))
    ) {
      return null;
    }
    return {
      title: parsed.title ?? null,
      summary: parsed.summary ?? null,
      ...(parsed.status
        ? { status: parsed.status as NonNullable<GenerationResetMetadata["status"]> }
        : {}),
    };
  } catch {
    return null;
  }
}

export const GENERATION_RESET_SOURCE_PATTERN = `${GENERATION_RESET_SOURCE}%`;
