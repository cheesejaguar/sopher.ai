/**
 * Compact, privacy-preserving summaries of CSP violation reports for logging.
 */

const MAX_REPORTS_PER_REQUEST = 10;

export type CspReportSummary = {
  directive: string;
  blocked: string;
  document: string;
  disposition: string;
};

function field(value: unknown): string {
  if (typeof value !== "string") return "";
  // Log only the origin + path of URLs: a query string can carry someone's data.
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 200);
  } catch {
    return value.slice(0, 200);
  }
}

/**
 * Two wire formats reach this endpoint: the legacy `report-uri` body
 * (`{"csp-report": {...}}`, kebab-case) and the Reporting API batch
 * (`[{"type": "csp-violation", "body": {...}}]`, camelCase).
 */
export function summarizeCspReports(payload: unknown): CspReportSummary[] {
  const legacy =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)["csp-report"]
      : undefined;
  if (legacy && typeof legacy === "object") {
    const report = legacy as Record<string, unknown>;
    return [
      {
        directive: field(report["effective-directive"] ?? report["violated-directive"]),
        blocked: field(report["blocked-uri"]),
        document: field(report["document-uri"]),
        disposition: field(report.disposition),
      },
    ];
  }
  if (!Array.isArray(payload)) return [];
  return payload
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .filter(
      (entry): entry is { type: string; body: Record<string, unknown> } =>
        Boolean(entry) &&
        typeof entry === "object" &&
        (entry as { type?: unknown }).type === "csp-violation" &&
        typeof (entry as { body?: unknown }).body === "object" &&
        (entry as { body?: unknown }).body !== null,
    )
    .map(({ body }) => ({
      directive: field(body.effectiveDirective),
      blocked: field(body.blockedURL),
      document: field(body.documentURL),
      disposition: field(body.disposition),
    }));
}
