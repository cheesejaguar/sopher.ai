export const READER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** A non-secret share id keeps simultaneous reader cookies isolated by path. */
export function readerSessionCookieName(shareId: string): string {
  return `sopher_reader_${shareId.replaceAll("-", "")}`;
}

export function readerSessionCookiePath(shareId: string): string {
  return `/r/${shareId}`;
}
