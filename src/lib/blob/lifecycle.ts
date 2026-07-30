import { del } from "@vercel/blob";

type UploadedBlob = {
  pathname: string;
};

type DeleteBlobs = (pathnames: string[]) => Promise<unknown>;

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Delete uploaded objects as one idempotent compensation operation. */
export async function deleteUploadedBlobs(
  pathnames: string[],
  context: string,
  deleteBlobs: DeleteBlobs = del,
): Promise<void> {
  const uniquePathnames = [...new Set(pathnames.filter(Boolean))];
  if (uniquePathnames.length === 0) return;

  try {
    await deleteBlobs(uniquePathnames);
  } catch (error) {
    console.error(`Could not compensate ${context} blob upload`, {
      pathnames: uniquePathnames,
      error,
    });
    throw error;
  }
}

/**
 * Resolve parallel uploads without leaking the successful half when another
 * upload fails. Callers receive results in input order, just like Promise.all.
 */
export async function resolveBlobUploads<T extends UploadedBlob>(
  uploads: Array<Promise<T>>,
  context: string,
  deleteBlobs: DeleteBlobs = del,
): Promise<T[]> {
  const settled = await Promise.allSettled(uploads);
  const failure = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (!failure) {
    return settled.map((result) => (result as PromiseFulfilledResult<T>).value);
  }

  const uploadedPathnames = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value.pathname] : [],
  );
  try {
    await deleteUploadedBlobs(uploadedPathnames, context, deleteBlobs);
  } catch (cleanupError) {
    throw new AggregateError(
      [asError(failure.reason), asError(cleanupError)],
      `${context} upload failed and its partial upload could not be removed`,
    );
  }
  throw failure.reason;
}

/** Preserve both the persistence error and any failed storage compensation. */
export async function compensateBlobPersistenceFailure(
  error: unknown,
  pathnames: string[],
  context: string,
  deleteBlobs: DeleteBlobs = del,
): Promise<never> {
  try {
    await deleteUploadedBlobs(pathnames, context, deleteBlobs);
  } catch (cleanupError) {
    throw new AggregateError(
      [asError(error), asError(cleanupError)],
      `${context} persistence failed and its uploaded blob could not be removed`,
    );
  }
  throw error;
}
