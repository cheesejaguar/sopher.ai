import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

export type AuthoringIncidentCategory = typeof schema.authoringIncidents.$inferInsert.category;
export type AuthoringIncidentSeverity = typeof schema.authoringIncidents.$inferInsert.severity;
export type AuthoringIncidentEvidence = typeof schema.authoringIncidents.$inferInsert.evidence;

const SENSITIVE_EVIDENCE_KEY =
  /(brief|content|manuscript|prompt|notes?|email|name|synopsis|instruction|payload)/i;

/**
 * Incidents are operational breadcrumbs, not a shadow copy of author work.
 * Runtime filtering keeps accidental prose/PII out even when a caller widens
 * its local type or forwards an exception object.
 */
export function sanitizeAuthoringIncidentEvidence(
  evidence: Record<string, unknown>,
): AuthoringIncidentEvidence {
  const safe: AuthoringIncidentEvidence = {};
  for (const [rawKey, value] of Object.entries(evidence)) {
    const key = rawKey.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
    if (!key || SENSITIVE_EVIDENCE_KEY.test(key)) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    } else if (typeof value === "string") {
      safe[key] = value.slice(0, 200);
    }
  }
  return safe;
}

export async function recordAuthoringIncident(input: {
  runId: string;
  projectId: string;
  category: AuthoringIncidentCategory;
  severity: AuthoringIncidentSeverity;
  dedupeKey: string;
  evidence?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date();
  const evidence = sanitizeAuthoringIncidentEvidence(input.evidence ?? {});
  await getDb()
    .insert(schema.authoringIncidents)
    .values({
      runId: input.runId,
      projectId: input.projectId,
      category: input.category,
      severity: input.severity,
      dedupeKey: input.dedupeKey.slice(0, 200),
      evidence,
      firstObservedAt: now,
      lastObservedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.authoringIncidents.runId, schema.authoringIncidents.dedupeKey],
      targetWhere: isNull(schema.authoringIncidents.resolvedAt),
      set: {
        category: input.category,
        severity: input.severity,
        evidence,
        occurrenceCount: sql`${schema.authoringIncidents.occurrenceCount} + 1`,
        lastObservedAt: now,
      },
    });
}

export async function resolveAuthoringIncident(input: {
  runId: string;
  dedupeKey: string;
}): Promise<void> {
  await getDb()
    .update(schema.authoringIncidents)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(schema.authoringIncidents.runId, input.runId),
        eq(schema.authoringIncidents.dedupeKey, input.dedupeKey),
        isNull(schema.authoringIncidents.resolvedAt),
      ),
    );
}
