import { notFound } from "next/navigation";

import { getProject, sampleChapters, sampleProse } from "@/lib/placeholder-data";

export default async function ManuscriptPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  const firstChapter = sampleChapters[0];

  return (
    <div className="space-y-4">
      <h2 className="sr-only">Manuscript</h2>

      <div className="paper-surface px-6 py-12 sm:px-12 sm:py-16">
        <header className="mx-auto max-w-2xl py-10 text-center sm:py-16">
          <p className="font-sans text-xs tracking-[0.25em] text-paper-muted uppercase">
            {project.genre}
          </p>
          <h3 className="mt-5 font-display text-4xl font-semibold text-balance text-paper-foreground sm:text-5xl">
            {project.title}
          </h3>
          <p className="mt-6 font-serif text-paper-muted italic">an early reading copy</p>
          <p aria-hidden="true" className="mt-12 text-paper-muted">
            ⁂
          </p>
        </header>

        <section className="prose-manuscript prose-manuscript--book mx-auto">
          <h2>
            Chapter {firstChapter.number}
            <br />
            {firstChapter.title}
          </h2>
          {sampleProse.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        The full reading view assembles every chapter once editing completes — export to EPUB and
        print follows.
      </p>
    </div>
  );
}
