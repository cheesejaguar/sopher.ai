import { tool } from "ai";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import {
  type AuthoringToolMutationContext,
  withAuthoringToolMutation,
} from "@/ai/tools/authoring-mutation";
import {
  ENTITY_KINDS,
  GUARDED_ATTRS,
  KIND_TO_ISSUE_CATEGORY,
  RELATIONSHIP_TYPES,
  parseAttrs,
  type EntityKind,
} from "@/ai/schemas/entities";

/**
 * Story-bible tools. These are the agents' only authoritative source for who
 * someone is, what a place contains, or what an object can do — the point being
 * that a chapter written in wave 3 asks rather than invents.
 */

export type EntityToolCtx = AuthoringToolMutationContext;
type EntityRelationResult = {
  recorded: boolean;
  reason?: string;
  from?: string;
  to?: string;
  type?: (typeof RELATIONSHIP_TYPES)[number];
};

/** Scalar attrs that already have a different value — the drift we care about. */
export function findConflicts(
  kind: EntityKind,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): { field: string; from: string; to: string }[] {
  const conflicts: { field: string; from: string; to: string }[] = [];
  for (const field of GUARDED_ATTRS[kind]) {
    const before = existing[field];
    const after = incoming[field];
    if (typeof before !== "string" || typeof after !== "string") continue;
    if (!before.trim() || !after.trim()) continue;
    if (before.trim().toLowerCase() !== after.trim().toLowerCase()) {
      conflicts.push({ field, from: before, to: after });
    }
  }
  return conflicts;
}

export function entityGet(ctx: EntityToolCtx) {
  return tool({
    description:
      "Look up canonical facts about people, places, objects, organizations or events in this book. Consult before writing anything involving one — never invent a detail that might already be established.",
    inputSchema: z.object({
      names: z.array(z.string()).min(1).max(8).describe("Entity names to look up"),
      kind: z.enum(ENTITY_KINDS).optional().describe("Narrow the lookup to one kind"),
    }),
    execute: async ({ names, kind }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.entities)
        .where(
          kind
            ? and(eq(schema.entities.bookId, ctx.bookId), eq(schema.entities.kind, kind))
            : eq(schema.entities.bookId, ctx.bookId),
        );

      const wanted = new Set(names.map((n) => n.toLowerCase()));
      const matches = (row: (typeof rows)[number]) =>
        wanted.has(row.name.toLowerCase()) ||
        row.aliases.some((alias) => wanted.has(alias.toLowerCase()));

      const found = rows.filter(matches);
      const ids = found.map((r) => r.id);

      // Relationships give the writer the family/ownership context that keeps
      // names and possessions consistent.
      const relationships = ids.length
        ? await db
            .select({
              from: schema.entityRelationships.fromEntityId,
              to: schema.entityRelationships.toEntityId,
              type: schema.entityRelationships.type,
              description: schema.entityRelationships.description,
            })
            .from(schema.entityRelationships)
            .where(eq(schema.entityRelationships.bookId, ctx.bookId))
        : [];

      const nameById = new Map(rows.map((r) => [r.id, r.name]));

      return {
        entities: found.map((r) => ({
          kind: r.kind,
          name: r.name,
          aliases: r.aliases,
          attrs: r.attrs,
          firstAppearanceChapter: r.firstAppearanceChapter,
          relationships: relationships
            .filter((rel) => rel.from === r.id || rel.to === r.id)
            .map((rel) => ({
              type: rel.type,
              other: nameById.get(rel.from === r.id ? rel.to : rel.from) ?? "unknown",
              direction: rel.from === r.id ? "outgoing" : "incoming",
              description: rel.description,
            })),
        })),
        missing: names.filter(
          (n) =>
            !found.some(
              (r) =>
                r.name.toLowerCase() === n.toLowerCase() ||
                r.aliases.some((a) => a.toLowerCase() === n.toLowerCase()),
            ),
        ),
      };
    },
  });
}

export function entitySearch(ctx: EntityToolCtx) {
  return tool({
    description:
      "Search the story bible by partial name or kind when you do not know the exact name. Use before inventing a new entity, to avoid creating a duplicate under a slightly different name.",
    inputSchema: z.object({
      query: z.string().min(1).max(80).optional(),
      kind: z.enum(ENTITY_KINDS).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    execute: async ({ query, kind, limit }) => {
      const db = getDb();
      const filters = [eq(schema.entities.bookId, ctx.bookId)];
      if (kind) filters.push(eq(schema.entities.kind, kind));
      if (query) {
        const like = `%${query}%`;
        filters.push(
          or(
            ilike(schema.entities.name, like),
            sql`${schema.entities.aliases}::text ilike ${like}`,
          )!,
        );
      }
      const rows = await db
        .select({
          kind: schema.entities.kind,
          name: schema.entities.name,
          aliases: schema.entities.aliases,
          firstAppearanceChapter: schema.entities.firstAppearanceChapter,
        })
        .from(schema.entities)
        .where(and(...filters))
        .limit(limit);
      return { results: rows };
    },
  });
}

export function entityUpsert(ctx: EntityToolCtx) {
  return tool({
    description:
      "Create or update an entity in the story bible. Call after drafting for anything you established that later chapters must honor — a character's appearance, what a room contains, who holds an object. Contradicting an existing detail is recorded as a continuity issue rather than silently overwriting canon.",
    inputSchema: z.object({
      kind: z.enum(ENTITY_KINDS),
      name: z.string().min(1).max(120),
      aliases: z.array(z.string()).max(8).default([]),
      attrs: z
        .record(z.string(), z.unknown())
        .default({})
        .describe("Kind-appropriate attributes. Include `facts` for new canonical statements."),
    }),
    execute: async ({ kind, name, aliases, attrs }, { toolCallId }) => {
      const logicalOrdinal = ctx.nextMutationOrdinal?.();
      const parsed = parseAttrs(kind, attrs) as Record<string, unknown>;
      return withAuthoringToolMutation({
        ctx,
        toolName: "entityUpsert",
        toolCallId,
        logicalOrdinal,
        payload: { kind, name, aliases, attrs: parsed },
        mutate: async (tx) => {
          // Case-insensitive resolution, then reuse the stored casing: get/search/
          // relate all match case-insensitively, so "biscuit" must update Biscuit
          // rather than minting a duplicate row the unique index cannot catch.
          const [existing] = await tx
            .select({
              id: schema.entities.id,
              name: schema.entities.name,
              attrs: schema.entities.attrs,
            })
            .from(schema.entities)
            .where(
              and(
                eq(schema.entities.bookId, ctx.bookId),
                eq(schema.entities.kind, kind),
                sql`lower(${schema.entities.name}) = lower(${name})`,
              ),
            )
            .limit(1);
          const canonicalName = existing?.name ?? name;

          const conflicts = existing ? findConflicts(kind, existing.attrs, parsed) : [];
          if (conflicts.length > 0) {
            await tx.insert(schema.continuityIssues).values(
              conflicts.map((c) => ({
                bookId: ctx.bookId,
                runId: ctx.runId!,
                chapters: ctx.chapterNumber ? [ctx.chapterNumber] : [],
                category: KIND_TO_ISSUE_CATEGORY[kind],
                severity: "major" as const,
                description: `${kind} "${canonicalName}": ${c.field} was established as "${c.from}" but chapter ${ctx.chapterNumber ?? "?"} says "${c.to}".`,
                suggestedFix: `Keep the established "${c.from}" unless the change is deliberate and explained in the prose.`,
              })),
            );
          }

          // Guarded scalars stay as first established; everything else may refine.
          // Also drop empty values: parseAttrs fills omitted list fields with []
          // defaults, and merging those would wipe stored personality/contents/etc
          // on any partial update.
          const conflicted = new Set(conflicts.map((c) => c.field));
          const safeAttrs = Object.fromEntries(
            Object.entries(parsed).filter(([key, value]) => {
              if (conflicted.has(key)) return false;
              if (value === undefined || value === null) return false;
              if (Array.isArray(value) && value.length === 0 && key !== "facts") return false;
              if (typeof value === "string" && !value.trim()) return false;
              return true;
            }),
          );
          const { facts: incomingFacts = [], ...scalars } = safeAttrs as {
            facts?: string[];
            [key: string]: unknown;
          };

          // Atomic: chapters draft four at a time, so merge in one statement rather
          // than read-modify-write. The parens around (excluded.attrs->'facts') are
          // load-bearing — `||` and `->` are equal precedence and left-associative,
          // so without them this parses as (attrs || excluded.attrs)->'facts'.
          await tx
            .insert(schema.entities)
            .values({
              bookId: ctx.bookId,
              kind,
              name: canonicalName,
              aliases,
              attrs: { ...scalars, facts: incomingFacts },
              firstAppearanceChapter: ctx.chapterNumber,
              lastUpdatedChapter: ctx.chapterNumber,
            })
            .onConflictDoUpdate({
              target: [schema.entities.bookId, schema.entities.kind, schema.entities.name],
              set: {
                attrs: sql`jsonb_set(
                  ${schema.entities.attrs} || (${JSON.stringify(scalars)}::jsonb),
                  '{facts}',
                  coalesce(${schema.entities.attrs}->'facts', '[]'::jsonb) || (excluded.attrs->'facts')
                )`,
                aliases: sql`(
                  select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
                  from jsonb_array_elements(${schema.entities.aliases} || excluded.aliases)
                )`,
                lastUpdatedChapter: ctx.chapterNumber,
                updatedAt: new Date(),
              },
            });

          return {
            recorded: true,
            kind,
            name: canonicalName,
            conflicts: conflicts.map((c) => `${c.field}: "${c.from}" vs "${c.to}"`),
          };
        },
        replay: async (tx) => {
          const [existing] = await tx
            .select({
              name: schema.entities.name,
              attrs: schema.entities.attrs,
            })
            .from(schema.entities)
            .where(
              and(
                eq(schema.entities.bookId, ctx.bookId),
                eq(schema.entities.kind, kind),
                sql`lower(${schema.entities.name}) = lower(${name})`,
              ),
            )
            .limit(1);
          const conflicts = existing ? findConflicts(kind, existing.attrs, parsed) : [];
          return {
            recorded: true,
            kind,
            name: existing?.name ?? name,
            conflicts: conflicts.map((c) => `${c.field}: "${c.from}" vs "${c.to}"`),
          };
        },
      });
    },
  });
}

export function entityRelate(ctx: EntityToolCtx) {
  return tool({
    description:
      "Record a relationship between two entities — siblings, an owner and a possession, a member and their organization. Family relationships are what let later chapters derive consistent surnames.",
    inputSchema: z.object({
      from: z.string().min(1).describe("Name of the entity the relationship starts at"),
      to: z.string().min(1).describe("Name of the related entity"),
      type: z.enum(RELATIONSHIP_TYPES),
      description: z.string().max(400).optional(),
    }),
    execute: async ({ from, to, type, description }, { toolCallId }) => {
      const logicalOrdinal = ctx.nextMutationOrdinal?.();
      return withAuthoringToolMutation<EntityRelationResult>({
        ctx,
        toolName: "entityRelate",
        toolCallId,
        logicalOrdinal,
        payload: { from, to, type, description: description ?? null },
        mutate: async (tx) => {
          const rows = await tx
            .select({ id: schema.entities.id, name: schema.entities.name })
            .from(schema.entities)
            .where(eq(schema.entities.bookId, ctx.bookId));

          const lookup = (name: string) =>
            rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
          const fromRow = lookup(from);
          const toRow = lookup(to);
          if (!fromRow || !toRow) {
            return {
              recorded: false,
              reason: `Unknown entity: ${!fromRow ? from : to}. Create it with entityUpsert first.`,
            };
          }

          await tx
            .insert(schema.entityRelationships)
            .values({
              bookId: ctx.bookId,
              fromEntityId: fromRow.id,
              toEntityId: toRow.id,
              type,
              description,
              establishedChapter: ctx.chapterNumber,
            })
            .onConflictDoNothing();

          return { recorded: true, from: fromRow.name, to: toRow.name, type };
        },
        replay: () => ({ recorded: true, from, to, type }),
        shouldRecord: (result) => result.recorded,
      });
    },
  });
}
