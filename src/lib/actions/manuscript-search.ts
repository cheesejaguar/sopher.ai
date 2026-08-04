"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import {
  HEADLINE_START_SEL,
  HEADLINE_STOP_SEL,
  parseHeadline,
  type SearchExcerptSegment,
} from "@/lib/editor/replace-plan";

/**
 * Manuscript-wide search. Read-only, deterministic, free.
 *
 * Postgres full text does the work: `websearch_to_tsquery` accepts what an
 * author actually types (quoted phrases, `or`, a leading `-`) and never throws
 * on malformed input the way `to_tsquery` does, while `ts_headline` returns the
 * excerpt already centred on the hit. The GIN index on
 * `to_tsvector('english', content)` (migration 0020) is what keeps this one
 * index scan instead of a read of every chapter in the book.
 */

const HEADLINE_OPTIONS = [
  `StartSel=${HEADLINE_START_SEL}`,
  `StopSel=${HEADLINE_STOP_SEL}`,
  "MaxFragments=2",
  "MinWords=8",
  "MaxWords=22",
  'FragmentDelimiter=" … "',
].join(",");

const searchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(50).default(20),
});

export type ManuscriptSearchHit = {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  excerpt: SearchExcerptSegment[];
  rank: number;
};

export type ManuscriptSearchResult =
  | { ok: true; hits: ManuscriptSearchHit[]; truncated: boolean }
  | { ok: false; error: "invalid" | "not_found"; message: string };

export async function searchManuscript(
  projectId: string,
  input: unknown,
): Promise<ManuscriptSearchResult> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(projectId).success) {
    return { ok: false, error: "not_found", message: "This book was not found." };
  }
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: "Type at least two characters to search." };
  }
  const { query, limit } = parsed.data;

  // Ownership is part of the query rather than a preceding read: one round trip,
  // and no window in which the join could be satisfied by another user's book.
  // ts_headline runs in the outer select so it only formats the rows that
  // actually made the page, not every chapter that matched.
  const { rows } = await getDb().execute<{
    chapter_id: string;
    chapter_number: number;
    title: string | null;
    excerpt: string | null;
    rank: number | string;
  }>(sql`
    with search as (
      select websearch_to_tsquery('english', ${query}) as query
    ),
    matches as (
      select
        c.id,
        c.chapter_number,
        c.title,
        c.content,
        ts_rank(to_tsvector('english', c.content), search.query) as rank
      from chapters c
      join books b on b.id = c.book_id
      join projects p on p.id = b.project_id
      cross join search
      where p.id = ${projectId}
        and p.user_id = ${userId}
        and to_tsvector('english', c.content) @@ search.query
      order by rank desc, c.chapter_number asc
      limit ${limit + 1}
    )
    select
      m.id as chapter_id,
      m.chapter_number,
      m.title,
      ts_headline('english', m.content, search.query, ${HEADLINE_OPTIONS}) as excerpt,
      m.rank
    from matches m
    cross join search
    order by m.rank desc, m.chapter_number asc
  `);

  const truncated = rows.length > limit;
  return {
    ok: true,
    truncated,
    hits: rows.slice(0, limit).map((row) => ({
      chapterId: row.chapter_id,
      chapterNumber: row.chapter_number,
      title: row.title,
      excerpt: parseHeadline(row.excerpt ?? ""),
      rank: Number(row.rank),
    })),
  };
}
