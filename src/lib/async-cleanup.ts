/**
 * Runs cleanup for both success and failure without letting cleanup replace
 * the operation's initiating error. A cleanup failure after successful work
 * still propagates so the durable caller can retry it.
 */
export async function withPreservedPrimaryError<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
  onSuppressedCleanupError?: (error: unknown) => void,
): Promise<T> {
  let operationFailed = false;
  try {
    return await operation();
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      if (!operationFailed) throw cleanupError;
      onSuppressedCleanupError?.(cleanupError);
    }
  }
}
