import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { readBookMatter } from "@/lib/book-package";
import { renderExport } from "@/lib/export";
import { buildChapterManuscript, chapterFilenameStem } from "@/lib/export/chapter";
import { loadFigures } from "@/lib/export/figures";
import { EXPORT_FORMATS, FORMAT_META } from "@/lib/export/types";

export const maxDuration = 60;

const paramsSchema = z.object({ chapterId: z.uuid() });
const formatSchema = z.enum(EXPORT_FORMATS).default("md");

/**
 * Downloads one chapter in the requested format. Unlike the whole-book export
 * this renders inline and streams the bytes back: a single chapter is small
 * enough to build inside the request, and the durable export Workflow exists
 * for the long multi-chapter assembly a request cannot outlive.
 */
export async function GET(req: Request, ctx: { params: Promise<{ chapterId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
  const params = paramsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }
  const parsedFormat = formatSchema.safeParse(
    new URL(req.url).searchParams.get("format") ?? undefined,
  );
  if (!parsedFormat.success) {
    return Response.json({ error: "Unsupported export format" }, { status: 400 });
  }
  const format = parsedFormat.data;

  // Ownership is the join itself: a chapter belonging to someone else's project
  // simply does not come back, so it is indistinguishable from a missing one.
  const [row] = await getDb()
    .select({
      projectId: schema.projects.id,
      genre: schema.projects.genre,
      bookTitle: schema.books.title,
      frontMatter: schema.books.frontMatter,
      number: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      content: schema.chapters.content,
    })
    .from(schema.chapters)
    .innerJoin(schema.books, eq(schema.chapters.bookId, schema.books.id))
    .innerJoin(schema.projects, eq(schema.books.projectId, schema.projects.id))
    .where(and(eq(schema.chapters.id, params.data.chapterId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!row) return Response.json({ error: "Chapter not found" }, { status: 404 });
  if (!row.content.trim()) {
    return Response.json({ error: "This chapter has no prose yet" }, { status: 409 });
  }

  const manuscript = buildChapterManuscript({
    bookTitle: row.bookTitle,
    genre: row.genre,
    matter: readBookMatter(row.frontMatter),
    chapter: { number: row.number, title: row.title, content: row.content },
    figures: await loadFigures(row.projectId),
  });
  const rendered = await renderExport(format, manuscript);

  // `chapterFilenameStem` only ever yields [a-z0-9-], so nothing in the title
  // can close the quoted header early or inject a second header line.
  const filename = `${chapterFilenameStem(row.bookTitle, row.number)}.${FORMAT_META[format].extension}`;
  // `ExportResult.buffer` is a Uint8Array over an unspecified ArrayBufferLike,
  // which a response body will not accept; re-view it over a plain ArrayBuffer.
  return new Response(Uint8Array.from(rendered.buffer), {
    headers: {
      "Content-Type": rendered.contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
