import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { BookPackageForm } from "@/components/manuscript/book-package-form";
import { BookMatterPreview } from "@/components/manuscript/book-matter-preview";
import { Button } from "@/components/ui/button";
import { getProjectWithBook } from "@/db/queries/books";
import { requireUser } from "@/lib/auth";
import { readBookMatter } from "@/lib/book-package";

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

      <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
        <BookMatterPreview matter={matter} chapterCount={data.project.targetChapters} />
      </aside>
    </div>
  );
}
