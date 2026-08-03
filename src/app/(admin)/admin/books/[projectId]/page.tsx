import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { markdownToHtml } from "@/lib/export/assemble";
import { getAdminBook } from "@/db/queries/admin";
import { AuthorInputsPanel } from "@/components/admin/author-inputs";
import { PageHeader } from "@/components/studio/product-primitives";

export const metadata = { title: "Book — admin" };

/**
 * Read-only manuscript view for moderation review. This is the author's
 * private work — the banner keeps that fact in the reviewer's face, and there
 * are deliberately no edit affordances of any kind.
 */
export default async function AdminBookView({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const book = await getAdminBook(projectId);
  if (!book) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={book.title}
        description={`By ${book.email} · ${book.genre ?? "no genre"} · ${book.status}`}
        actions={
          <Link
            href={`/admin/users/${book.userId}`}
            className="inline-flex min-h-9 items-center text-sm font-medium text-primary hover:underline"
          >
            View author
          </Link>
        }
      />

      <p className="rounded-md border border-ember/40 bg-ember/5 px-4 py-2.5 text-sm">
        This is the author&rsquo;s private work, shown read-only for terms enforcement. Access is
        disclosed in the privacy policy.
      </p>

      <AuthorInputsPanel inputs={book} />

      {book.flags.length > 0 ? (
        <section aria-labelledby="b-flags" className="space-y-2">
          <h2 id="b-flags" className="font-sans font-semibold">
            Flags on this book
          </h2>
          <ul className="space-y-2">
            {book.flags.map((flag) => (
              <li
                key={flag.id}
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={flag.severity === "urgent" ? "destructive" : "outline"}>
                    {flag.category}
                  </Badge>
                  <span className="text-muted-foreground">
                    {flag.source}
                    {flag.chapterNumber ? ` · ch. ${flag.chapterNumber}` : ""} · {flag.status}
                  </span>
                </p>
                {flag.excerpt ? <p className="mt-1.5 italic">“{flag.excerpt}”</p> : null}
                {flag.detail ? <p className="mt-1 text-muted-foreground">{flag.detail}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Manuscript" className="space-y-8">
        {book.chapters.map((chapter) => (
          <article key={chapter.id} className="manuscript-sheet min-w-0 px-4 py-6 sm:px-10 sm:py-8">
            <h2 className="min-w-0 font-display text-lg leading-snug font-semibold text-paper-foreground [overflow-wrap:anywhere]">
              <span>
                Chapter {chapter.chapterNumber}
                {chapter.title ? ` — ${chapter.title}` : ""}
              </span>
              <span className="mt-2 block font-mono text-xs font-normal text-paper-muted sm:mt-0 sm:ml-2 sm:inline">
                {chapter.wordCount.toLocaleString()} words
              </span>
            </h2>
            <div
              className="prose-manuscript mt-4 [content-visibility:auto]"
              // Same escaped-HTML renderer as the author-facing reading view.
              dangerouslySetInnerHTML={{ __html: markdownToHtml(chapter.content) }}
            />
          </article>
        ))}
      </section>
    </div>
  );
}
