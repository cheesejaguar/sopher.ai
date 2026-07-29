/**
 * Postgres unique violation on uq_runs_active_per_project, possibly wrapped by
 * the driver. The partial unique index is the race-proof backstop behind every
 * "is a run already active?" pre-check.
 */
export function isActiveRunConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message, cause } = error as { code?: string; message?: string; cause?: unknown };
  if (code === "23505" || message?.includes("uq_runs_active_per_project")) return true;
  return cause !== undefined && isActiveRunConflict(cause);
}
