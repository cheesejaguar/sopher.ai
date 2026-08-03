import { sql, type SQLWrapper } from "drizzle-orm";

import type { GenerationConfig } from "@/lib/run-events";

/**
 * Protocol v2 introduced a run-owned manuscript digest that older, already
 * deployed workflows could never have written. Missing/legacy versions retain
 * their historically accepted terminal run plus the project completion
 * timestamp. Mutable chapter rows are intentionally not part of historical
 * proof: authors may restructure a manuscript after a valid completion.
 */
export function requiresRunOwnedFullBookCompletionProof(
  config: Partial<GenerationConfig> | null | undefined,
): boolean {
  return config?.protocolVersion !== undefined && config.protocolVersion !== 1;
}

/**
 * Database-side proof that a whole-book run finalized this exact manuscript.
 * Callers use this instead of projects.completed_at or status alone so a
 * contradictory v2 terminal row can never consume entitlement or trigger an
 * upgrade prompt. Deployment-pinned v1 runs remain valid after supported
 * post-completion editing because their terminal state was accepted by the
 * pinned workflow before author control resumed.
 */
export function validFullBookCompletionExistsSql(projectId: string | SQLWrapper) {
  return sql<boolean>`exists (
    select 1
    from generation_runs completed_run
    inner join projects completion_project
      on completion_project.id = completed_run.project_id
    where completed_run.project_id = ${projectId}
      and completed_run.kind = 'full_book'
      and completed_run.status = 'completed'
      and completion_project.completed_at is not null
      and (
        completed_run.config->>'protocolVersion' is null
        or completed_run.config->>'protocolVersion' = '1'
        or (
          coalesce(
            completed_run.config #>> '{completion,finalized,sourceRunId}',
            ''
          ) = completed_run.id::text
          and length(btrim(coalesce(
            completed_run.config #>> '{completion,finalized,manuscriptDigest}',
            ''
          ))) > 0
        )
      )
  )`;
}
