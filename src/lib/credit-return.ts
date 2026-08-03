import { z } from "zod";

const INTERNAL_ORIGIN = "https://sopher.ai";

/** Adds an owned run reference to an already validated in-app return path. */
export function creditReturnWithRun(path: string, runId: string): string {
  const url = new URL(path, INTERNAL_ORIGIN);
  url.searchParams.set("resumeRun", runId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Removes a stale or already-resolved run reference from a validated return path. */
export function creditReturnWithoutRun(path: string): string {
  const url = new URL(path, INTERNAL_ORIGIN);
  url.searchParams.delete("resumeRun");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Reads only a syntactically valid run id; ownership is rechecked server-side. */
export function creditReturnRunId(
  explicitRunId: string | undefined,
  safeReturnPath: string | null,
): string | null {
  const embeddedRunId = safeReturnPath
    ? new URL(safeReturnPath, INTERNAL_ORIGIN).searchParams.get("resumeRun")
    : null;
  const candidate = explicitRunId ?? embeddedRunId;
  return z.uuid().safeParse(candidate).success ? candidate! : null;
}
