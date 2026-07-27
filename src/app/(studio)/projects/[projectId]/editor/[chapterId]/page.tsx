import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { EditorToolbarMock } from "@/components/studio/editor-toolbar-mock";
import { chapterStatusLabels, formatWords, getChapter, sampleProse } from "@/lib/placeholder-data";

export default async function EditorChapterPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;
  const chapterNumber = Number(chapterId);
  const chapter = Number.isInteger(chapterNumber) ? getChapter(chapterNumber) : undefined;
  if (!chapter || chapter.status === "planned") notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/projects/${projectId}/editor`}
          className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          All chapters
        </Link>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatWords(chapter.wordCount)} words · {chapterStatusLabels[chapter.status]}
        </p>
      </div>

      <div className="paper-surface relative px-6 py-10 sm:px-12 sm:py-14">
        <article className="prose-manuscript mx-auto">
          <h2>
            Chapter {chapter.number} · {chapter.title}
          </h2>
          {sampleProse.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </article>
        <EditorToolbarMock />
      </div>

      <p className="text-xs text-muted-foreground">
        Suggestions will appear inline — accept, rework, or dismiss each one without losing your own
        words.
      </p>
    </div>
  );
}
