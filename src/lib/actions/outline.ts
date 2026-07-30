"use server";

import { revalidatePath } from "next/cache";

import { getSqlClient } from "@/db";
import { requireUser } from "@/lib/auth";
import { bookOutlineSchema } from "@/ai/schemas";

/**
 * Saves an author-edited outline as a new version with source "user" — the
 * enum value that existed since the schema was written and was never used.
 * Versions are append-only; the agents' original stays in the history.
 */
export async function saveOutline(projectId: string, input: unknown): Promise<void> {
  const { userId } = await requireUser();
  const outline = bookOutlineSchema.parse(input);
  const outlineJson = JSON.stringify(outline);
  const client = getSqlClient();

  // Outline edits and authoring-run creation share the same project advisory
  // lock. Whichever commits first owns the boundary: a completed outline edit
  // is visible to the run's post-insert snapshot, while an inserted run makes
  // the outline write a no-op. Version allocation and insertion are kept in
  // this transaction so concurrent saves cannot claim the same version.
  const [, result] = await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${projectId}, 0)
    )`,
    tx`
      with owned_book as materialized (
        select b.id
        from books b
        join projects p on p.id = b.project_id
        where p.id = ${projectId}
          and p.user_id = ${userId}
        limit 1
      ),
      active_run as materialized (
        select gr.id
        from generation_runs gr
        where gr.project_id = ${projectId}
          and gr.status in ('queued', 'running', 'awaiting_input')
          and gr.kind <> 'export'
        limit 1
      ),
      inserted as (
        insert into outlines (book_id, version, content, source)
        select
          ob.id,
          coalesce((select max(o.version) from outlines o where o.book_id = ob.id), 0) + 1,
          ${outlineJson}::jsonb,
          'user'
        from owned_book ob
        where not exists (select 1 from active_run)
        returning id
      )
      select
        case
          when not exists (select 1 from owned_book) then 'not_found'
          when exists (select 1 from active_run) then 'active_run'
          when exists (select 1 from inserted) then 'saved'
          else 'conflict'
        end as status
    `,
  ]);
  const status = (result as Array<{ status: string }>)[0]?.status;
  if (status === "not_found") throw new Error("Book not found");
  if (status === "active_run") {
    throw new Error("Finish or stop the current run before editing the outline");
  }
  if (status !== "saved") throw new Error("Outline changed while it was being saved");

  revalidatePath(`/projects/${projectId}/outline`);
}
