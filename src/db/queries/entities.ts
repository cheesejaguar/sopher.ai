import { and, asc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { ENTITY_KINDS, parseAttrs, type EntityKind } from "@/ai/schemas/entities";

/**
 * Story-bible persistence. Every write here has to survive a wave of four
 * chapters drafting at once, so merges happen in a single statement rather than
 * read-modify-write.
 */

export type EntitySeed = {
  kind: EntityKind;
  name: string;
  aliases?: string[];
  attrs?: Record<string, unknown>;
};

function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}

/**
 * Appends facts to entities, creating any that do not exist yet.
 *
 * The parens around `(excluded.attrs->'facts')` are load-bearing: `||` and `->`
 * have equal precedence and are left-associative, so without them this parses
 * as `(attrs || excluded.attrs)->'facts'` and the column resolves to NULL,
 * violating the NOT NULL constraint. That exact bug shipped once already.
 */
export async function applyEntityDeltas(input: {
  bookId: string;
  chapterNumber?: number;
  newFacts: { kind?: string; name: string; facts: string[] }[];
  relationships?: { from: string; to: string; type: string }[];
}): Promise<void> {
  const db = getDb();

  for (const entry of input.newFacts) {
    if (!entry.name?.trim() || entry.facts.length === 0) continue;
    const kind = entry.kind && isEntityKind(entry.kind) ? entry.kind : "character";

    await db
      .insert(schema.entities)
      .values({
        bookId: input.bookId,
        kind,
        name: entry.name.trim(),
        aliases: [],
        attrs: { facts: entry.facts },
        firstAppearanceChapter: input.chapterNumber,
        lastUpdatedChapter: input.chapterNumber,
      })
      .onConflictDoUpdate({
        target: [schema.entities.bookId, schema.entities.kind, schema.entities.name],
        set: {
          attrs: sql`jsonb_set(${schema.entities.attrs}, '{facts}', coalesce(${schema.entities.attrs}->'facts', '[]'::jsonb) || (excluded.attrs->'facts'))`,
          lastUpdatedChapter: input.chapterNumber,
          updatedAt: new Date(),
        },
      });
  }

  for (const rel of input.relationships ?? []) {
    if (!rel.from?.trim() || !rel.to?.trim()) continue;
    const rows = await db
      .select({ id: schema.entities.id, name: schema.entities.name, kind: schema.entities.kind })
      .from(schema.entities)
      .where(eq(schema.entities.bookId, input.bookId));
    // Prefer an exact-case match; among case-insensitive matches prefer a
    // character (family ties are the common case). Ambiguity across kinds with
    // no better signal drops the relationship rather than guessing wrong.
    const find = (name: string) => {
      const matches = rows.filter((r) => r.name.toLowerCase() === name.toLowerCase());
      if (matches.length <= 1) return matches[0];
      return (
        matches.find((r) => r.name === name) ??
        matches.find((r) => r.kind === "character") ??
        undefined
      );
    };
    const from = find(rel.from);
    const to = find(rel.to);
    // Relationships between entities we do not know about are dropped rather
    // than guessed at — the next chapter's upsert will create them.
    if (!from || !to || from.id === to.id) continue;

    await db
      .insert(schema.entityRelationships)
      .values({
        bookId: input.bookId,
        fromEntityId: from.id,
        toEntityId: to.id,
        type: rel.type || "other",
        establishedChapter: input.chapterNumber,
      })
      .onConflictDoNothing();
  }
}

/**
 * Seeds entities from the concept/outline pass. Existing rows win: a re-run
 * must never clobber canon that later chapters have already built on.
 */
export async function seedEntities(bookId: string, seeds: EntitySeed[]): Promise<void> {
  if (seeds.length === 0) return;
  await getDb()
    .insert(schema.entities)
    .values(
      seeds.map((seed) => ({
        bookId,
        kind: seed.kind,
        name: seed.name.trim(),
        aliases: seed.aliases ?? [],
        attrs: parseAttrs(seed.kind, seed.attrs ?? {}) as Record<string, unknown>,
      })),
    )
    .onConflictDoNothing({
      target: [schema.entities.bookId, schema.entities.kind, schema.entities.name],
    });
}

export type BibleEntity = {
  id: string;
  kind: EntityKind;
  name: string;
  aliases: string[];
  attrs: Record<string, unknown>;
  portraitUrl: string | null;
  firstAppearanceChapter: number | null;
  relationships: { type: string; other: string; description: string | null }[];
};

/** The whole bible for a book, ordered for display. */
export async function listEntities(bookId: string): Promise<BibleEntity[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.entities.id,
      kind: schema.entities.kind,
      name: schema.entities.name,
      aliases: schema.entities.aliases,
      attrs: schema.entities.attrs,
      firstAppearanceChapter: schema.entities.firstAppearanceChapter,
      portraitUrl: schema.assets.blobUrl,
    })
    .from(schema.entities)
    .leftJoin(schema.assets, eq(schema.assets.id, schema.entities.portraitAssetId))
    .where(eq(schema.entities.bookId, bookId))
    .orderBy(asc(schema.entities.kind), asc(schema.entities.name));

  const relationships = await db
    .select({
      from: schema.entityRelationships.fromEntityId,
      to: schema.entityRelationships.toEntityId,
      type: schema.entityRelationships.type,
      description: schema.entityRelationships.description,
    })
    .from(schema.entityRelationships)
    .where(eq(schema.entityRelationships.bookId, bookId));

  const nameById = new Map(rows.map((r) => [r.id, r.name]));

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as EntityKind,
    name: row.name,
    aliases: row.aliases,
    attrs: row.attrs,
    portraitUrl: row.portraitUrl,
    firstAppearanceChapter: row.firstAppearanceChapter,
    relationships: relationships
      .filter((rel) => rel.from === row.id || rel.to === row.id)
      .map((rel) => ({
        type: rel.type,
        other: nameById.get(rel.from === row.id ? rel.to : rel.from) ?? "unknown",
        description: rel.description,
      })),
  }));
}

/** One entity plus enough context to build a portrait prompt. */
export async function getEntityForPortrait(entityId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: schema.entities.id,
      bookId: schema.entities.bookId,
      kind: schema.entities.kind,
      name: schema.entities.name,
      attrs: schema.entities.attrs,
      projectId: schema.books.projectId,
      userId: schema.projects.userId,
      genre: schema.projects.genre,
    })
    .from(schema.entities)
    .innerJoin(schema.books, eq(schema.books.id, schema.entities.bookId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(eq(schema.entities.id, entityId))
    .limit(1);
  return row ?? null;
}

/** Open contradictions, so the Bible tab can flag entities that drifted. */
export async function openContradictions(bookId: string) {
  return getDb()
    .select({
      id: schema.continuityIssues.id,
      category: schema.continuityIssues.category,
      severity: schema.continuityIssues.severity,
      description: schema.continuityIssues.description,
      chapters: schema.continuityIssues.chapters,
    })
    .from(schema.continuityIssues)
    .where(
      and(eq(schema.continuityIssues.bookId, bookId), eq(schema.continuityIssues.status, "open")),
    );
}
