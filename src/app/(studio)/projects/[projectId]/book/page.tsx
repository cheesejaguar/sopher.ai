import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpenText, Check } from "lucide-react";

import { BookPackageForm } from "@/components/manuscript/book-package-form";
import { Button } from "@/components/ui/button";
import { getProjectWithBook } from "@/db/queries/books";
import { requireUser } from "@/lib/auth";
import {
  bookMatterPageCount,
  closingBookMatter,
  openingBookMatter,
  readBookMatter,
} from "@/lib/book-package";

export const metadata = { title: "Book setup" };

export default async function BookSetupPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();

  if (!data.book) {
    return (
      <section className="instrument-surface-raised rounded-sm px-5 py-8 sm:px-8">
        <h2 className="text-xl font-semibold tracking-tight">
          The book package starts with the book
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your brief is safe. Review the production setup first; the title page, dedication, and
          closing matter become editable as soon as the book record is prepared.
        </p>
        <Button className="mt-6" render={<Link href={`/projects/${projectId}/write`} />}>
          Review production
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Button>
      </section>
    );
  }

  const matter = readBookMatter(data.book.frontMatter);
  const opening = openingBookMatter(matter);
  const closing = closingBookMatter(matter);
  const orderedPages = [
    "Title page",
    ...(matter.copyrightHolder || matter.publisher || matter.isbn ? ["Copyright"] : []),
    ...(matter.dedication ? ["Dedication"] : []),
    ...(matter.epigraphText ? ["Epigraph"] : []),
    ...opening.map((section) => section.title),
    "Contents",
    `${data.project.targetChapters} chapters`,
    ...closing.map((section) => section.title),
  ];

  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">
        <header className="mb-9">
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">Build the complete book</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Chapter one should not be page one. Shape the title page, opening matter, rights page,
            and closing pages once; the reader and every export use the same source.
          </p>
        </header>
        <BookPackageForm
          projectId={projectId}
          title={data.book.title}
          synopsis={data.book.synopsis}
          matter={matter}
        />
      </div>

      <aside
        className="min-w-0 xl:sticky xl:top-24 xl:self-start"
        aria-labelledby="book-order-title"
      >
        <div className="instrument-surface overflow-hidden rounded-sm">
          <div className="border-b border-border p-4">
            <BookOpenText aria-hidden="true" className="size-4 text-primary" />
            <h3 id="book-order-title" className="mt-3 text-sm font-semibold">
              Reader order
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {bookMatterPageCount(matter)} prepared matter pages, plus contents and chapters.
            </p>
          </div>
          <ol className="divide-y divide-border">
            {orderedPages.map((label, index) => (
              <li key={`${label}-${index}`} className="flex min-h-10 items-center gap-3 px-4 py-2">
                <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 text-xs font-medium break-words">{label}</span>
                <Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
