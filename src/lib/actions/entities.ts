"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ENTITY_KINDS } from "@/ai/schemas/entities";
import { getSqlClient } from "@/db";
import { editableCanonAttrsPatch, type EditableEntityCanon } from "@/lib/bible/canon";
import { requireUser } from "@/lib/auth";
import { reconcileBeforeAuthoringRunConflict } from "@/lib/generation-runs";

const cleanList = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().max(maxLength))
    .max(maxItems)
    .transform((items) => {
      const seen = new Set<string>();
      return items
        .map((item) => item.trim())
        .filter((item) => {
          const key = item.toLocaleLowerCase();
          if (!item || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    });

const editableCanonSchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  name: z.string().trim().min(1).max(120),
  aliases: cleanList(8, 120),
  appearance: z.string().trim().max(4_000),
  background: z.string().trim().max(4_000),
  goals: cleanList(24, 500),
  personality: cleanList(24, 500),
  voice: z.string().trim().max(2_000),
  arc: z.string().trim().max(4_000),
  facts: cleanList(100, 500),
});

const createCanonSchema = editableCanonSchema.extend({
  kind: z.enum(["character", "location", "object"]),
});

export type EditableCanonInput = z.input<typeof editableCanonSchema>;
export type CreatableEntityKind = z.infer<typeof createCanonSchema>["kind"];

export type EntityMutationResult =
  | { ok: true; entityId: string }
  | {
      ok: false;
      error: "invalid" | "not_found" | "active_run" | "duplicate" | "conflict";
      message: string;
    };

type ParsedCanon = z.output<typeof editableCanonSchema>;

function aliasesWithoutName(aliases: string[], name: string): string[] {
  const normalizedName = name.toLocaleLowerCase();
  return aliases.filter((alias) => alias.toLocaleLowerCase() !== normalizedName);
}

function canonPatch(data: ParsedCanon): Record<string, unknown> {
  const editable: Omit<EditableEntityCanon, "name" | "aliases"> = {
    appearance: data.appearance,
    background: data.background,
    goals: data.goals,
    personality: data.personality,
    voice: data.voice,
    arc: data.arc,
    facts: data.facts,
  };
  return editableCanonAttrsPatch(data.kind, editable);
}

function failure(status: string): EntityMutationResult {
  if (status === "not_found") {
    return { ok: false, error: "not_found", message: "This Story Bible entry was not found." };
  }
  if (status === "active_run") {
    return {
      ok: false,
      error: "active_run",
      message: "Finish or stop the current authoring run before changing story canon.",
    };
  }
  if (status === "duplicate") {
    return {
      ok: false,
      error: "duplicate",
      message: "An entry of this type already uses that name. Choose a distinct canon name.",
    };
  }
  return {
    ok: false,
    error: "conflict",
    message: "The Story Bible changed before this save completed. Review it and try again.",
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string };
  return value.code === "23505" || Boolean(value.message?.includes("uq_entity_name"));
}

/** Author-owned edit of one canon entry. Unknown JSON attributes remain untouched. */
export async function updateBibleEntity(
  projectId: string,
  entityId: string,
  input: unknown,
): Promise<EntityMutationResult> {
  const { userId } = await requireUser();
  const parsed = editableCanonSchema.safeParse(input);
  if (!z.uuid().safeParse(entityId).success || !parsed.success) {
    return {
      ok: false,
      error: "invalid",
      message: "Check the highlighted canon fields and try again.",
    };
  }

  await reconcileBeforeAuthoringRunConflict({ projectId, userId });

  const data = parsed.data;
  const aliases = aliasesWithoutName(data.aliases, data.name);
  const attrs = JSON.stringify(canonPatch(data));
  const client = getSqlClient();

  try {
    const [, result] = await client.transaction((tx) => [
      tx`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${projectId}, 0)
      )`,
      tx`
        with owned_entity as materialized (
          select e.id, e.book_id, e.kind
          from entities e
          join books b on b.id = e.book_id
          join projects p on p.id = b.project_id
          where e.id = ${entityId}
            and e.kind = ${data.kind}
            and p.id = ${projectId}
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
        duplicate as materialized (
          select other.id
          from entities other
          join owned_entity owned on owned.book_id = other.book_id
          where other.kind = owned.kind
            and other.id <> owned.id
            and lower(other.name) = lower(${data.name})
          limit 1
        ),
        updated as (
          update entities e
          set name = ${data.name},
              aliases = ${JSON.stringify(aliases)}::jsonb,
              attrs = (
                case e.kind
                  when 'character' then e.attrs - array[
                    'appearance', 'background', 'goals', 'personality', 'speech', 'arc', 'facts'
                  ]::text[]
                  when 'location' then e.attrs - array[
                    'description', 'background', 'goals', 'personality', 'voice', 'arc', 'facts'
                  ]::text[]
                  when 'object' then e.attrs - array[
                    'description', 'provenance', 'goals', 'personality', 'voice', 'arc', 'facts'
                  ]::text[]
                  else e.attrs - array[
                    'appearance', 'background', 'goals', 'personality', 'voice', 'arc', 'facts'
                  ]::text[]
                end
              ) || ${attrs}::jsonb,
              updated_at = now()
          from owned_entity owned
          where e.id = owned.id
            and not exists (select 1 from active_run)
            and not exists (select 1 from duplicate)
          returning e.id
        )
        select
          case
            when not exists (select 1 from owned_entity) then 'not_found'
            when exists (select 1 from active_run) then 'active_run'
            when exists (select 1 from duplicate) then 'duplicate'
            when exists (select 1 from updated) then 'saved'
            else 'conflict'
          end as status,
          (select id from updated limit 1) as entity_id
      `,
    ]);
    const row = (result as Array<{ status: string; entity_id: string | null }>)[0];
    if (row?.status !== "saved" || !row.entity_id) return failure(row?.status ?? "conflict");

    revalidatePath(`/projects/${projectId}/bible`);
    return { ok: true, entityId: row.entity_id };
  } catch (error) {
    if (isUniqueViolation(error)) return failure("duplicate");
    console.error("Could not update Story Bible entity", { projectId, entityId, error });
    return failure("conflict");
  }
}

/** Adds an author-defined character, place, or object to an owned Story Bible. */
export async function createBibleEntity(
  projectId: string,
  input: unknown,
): Promise<EntityMutationResult> {
  const { userId } = await requireUser();
  const parsed = createCanonSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      message: "Add a name and check the canon fields before saving.",
    };
  }

  await reconcileBeforeAuthoringRunConflict({ projectId, userId });

  const data = parsed.data;
  const aliases = aliasesWithoutName(data.aliases, data.name);
  const attrs = JSON.stringify(canonPatch(data as ParsedCanon));
  const client = getSqlClient();

  try {
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
        duplicate as materialized (
          select e.id
          from entities e
          join owned_book owned on owned.id = e.book_id
          where e.kind = ${data.kind}
            and lower(e.name) = lower(${data.name})
          limit 1
        ),
        inserted as (
          insert into entities (book_id, kind, name, aliases, attrs, created_at, updated_at)
          select owned.id, ${data.kind}, ${data.name}, ${JSON.stringify(aliases)}::jsonb,
            ${attrs}::jsonb, now(), now()
          from owned_book owned
          where not exists (select 1 from active_run)
            and not exists (select 1 from duplicate)
          returning id
        )
        select
          case
            when not exists (select 1 from owned_book) then 'not_found'
            when exists (select 1 from active_run) then 'active_run'
            when exists (select 1 from duplicate) then 'duplicate'
            when exists (select 1 from inserted) then 'created'
            else 'conflict'
          end as status,
          (select id from inserted limit 1) as entity_id
      `,
    ]);
    const row = (result as Array<{ status: string; entity_id: string | null }>)[0];
    if (row?.status !== "created" || !row.entity_id) return failure(row?.status ?? "conflict");

    revalidatePath(`/projects/${projectId}/bible`);
    return { ok: true, entityId: row.entity_id };
  } catch (error) {
    if (isUniqueViolation(error)) return failure("duplicate");
    console.error("Could not create Story Bible entity", { projectId, error });
    return failure("conflict");
  }
}
