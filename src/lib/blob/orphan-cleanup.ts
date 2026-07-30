import { del } from "@vercel/blob";

function uniquePathnames(pathnames: string[]): string[] {
  return [...new Set(pathnames.filter(Boolean))];
}

/**
 * Schedule a delayed, reference-aware cleanup before attempting the database
 * write that will make uploaded objects durable. The workflow keeps its own
 * copy of every pathname and deletes only objects that still have no asset
 * row after the request's maximum runtime has elapsed.
 */
export async function scheduleUnreferencedBlobCleanup(input: {
  projectId: string;
  pathnames: string[];
}): Promise<void> {
  const pathnames = uniquePathnames(input.pathnames);
  if (pathnames.length === 0) return;
  const [{ start }, { cleanupUnreferencedBlobs }] = await Promise.all([
    import("workflow/api"),
    import("@/workflows/cleanup-unreferenced-blobs"),
  ]);
  await start(cleanupUnreferencedBlobs, [input.projectId, pathnames]);
}

/**
 * Compensate a known failed upload durably. If Workflow scheduling itself is
 * unavailable, one immediate idempotent delete is the safe fallback.
 */
export async function compensateUnreferencedBlobUpload(input: {
  projectId: string;
  pathnames: string[];
}): Promise<void> {
  const pathnames = uniquePathnames(input.pathnames);
  if (pathnames.length === 0) return;

  try {
    await scheduleUnreferencedBlobCleanup({ projectId: input.projectId, pathnames });
    return;
  } catch (scheduleError) {
    try {
      await del(pathnames);
      return;
    } catch (deleteError) {
      console.error("Could not schedule or immediately remove unreferenced Blob uploads", {
        projectId: input.projectId,
        pathnames,
        scheduleError,
        deleteError,
      });
      throw new AggregateError(
        [
          scheduleError instanceof Error ? scheduleError : new Error(String(scheduleError)),
          deleteError instanceof Error ? deleteError : new Error(String(deleteError)),
        ],
        "Unreferenced Blob cleanup could not be made durable",
      );
    }
  }
}
