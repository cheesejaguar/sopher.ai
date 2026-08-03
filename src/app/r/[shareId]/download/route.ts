import { cookies } from "next/headers";

import { filenameStem } from "@/lib/export/types";
import { manuscriptToMarkdown } from "@/lib/export/assemble";
import {
  loadReaderEdition,
  publicationMatter,
  readerShareIdSchema,
} from "@/lib/publication-editions";
import { readerSessionCookieName } from "@/lib/reader-session";

export async function GET(_req: Request, ctx: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await ctx.params;
  if (!readerShareIdSchema.safeParse(shareId).success) {
    return new Response("Reader edition not found", { status: 404 });
  }
  const token = (await cookies()).get(readerSessionCookieName(shareId))?.value;
  const loadedEdition = token ? await loadReaderEdition(token) : null;
  const edition = loadedEdition?.shareId === shareId ? loadedEdition : null;
  if (!edition?.allowDownload) {
    return new Response("Reader edition not found", { status: 404 });
  }
  const snapshot = edition.snapshot;
  const markdown = manuscriptToMarkdown({
    title: snapshot.title,
    author: snapshot.author,
    synopsis: snapshot.synopsis,
    genre: snapshot.genre,
    chapters: snapshot.chapters,
    totalWords: snapshot.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    figures: snapshot.figures,
    coverUrl: snapshot.coverUrl,
    matter: publicationMatter(snapshot),
    editionNote: snapshot.editionNote,
  });
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameStem(snapshot.title)}.md"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive, noimageindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
