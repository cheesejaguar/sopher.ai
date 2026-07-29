import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getActiveRun, getLatestOutline, getProjectWithBook } from "@/db/queries/books";
import { bookOutlineSchema, type BookOutline } from "@/ai/schemas";
import { OutlineApprovalBar } from "@/components/generation/outline-approval-bar";
import { OutlineEditor } from "@/components/studio/outline-editor";

function words(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

const ARC_LABELS: Record<BookOutline["chapters"][number]["emotionalArc"], string> = {
  exposition: "Exposition",
  rising_action: "Rising action",
  tension_building: "Tension building",
  climax: "Climax",
  falling_action: "Falling action",
  resolution: "Resolution",
  denouement: "Denouement",
  transition: "Transition",
};

export default async function OutlinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();
  const { book } = data;

  const [outlineRow, activeRun] = await Promise.all([
    book ? getLatestOutline(book.id) : Promise.resolve(null),
    getActiveRun(projectId),
  ]);
  const parsed = outlineRow ? bookOutlineSchema.safeParse(outlineRow.content) : null;
  const outline = parsed?.success ? parsed.data : null;
  const awaitingApproval = activeRun?.status === "awaiting_input";

  if (!outline) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">Outline</h2>
        <div className="paper-surface flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="font-serif text-lg text-paper-muted">No outline yet.</p>
          <p className="max-w-sm font-sans text-xs text-paper-muted">
            The Outliner drafts a chapter-by-chapter structure at the start of a run. Start writing
            and it appears here.
          </p>
          <Button
            className="mt-2"
            render={<Link href={`/projects/${projectId}/write`} />}
            nativeButton={false}
          >
            Go to the write desk
          </Button>
        </div>
      </div>
    );
  }

  const plannedWords = outline.chapters.reduce((acc, chapter) => acc + chapter.targetWords, 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">Outline</h2>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            v{outlineRow?.version ?? 1}
            {outlineRow?.source === "user" ? " (edited)" : ""} · {outline.chapters.length} chapters
            · ~{words(plannedWords)} words planned
          </p>
          {!awaitingApproval ? <OutlineEditor projectId={projectId} outline={outline} /> : null}
        </div>
      </header>

      <article className="paper-surface px-6 py-8 sm:px-10 sm:py-10">
        <p className="font-sans text-xs tracking-widest text-paper-muted uppercase">
          The plan, chapter by chapter
        </p>
        <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-balance text-paper-foreground">
          {outline.title}
        </h3>
        <p className="mt-2 font-serif text-lg text-paper-muted italic">{outline.logline}</p>

        <div className="prose-manuscript mt-5">
          <p>{outline.synopsis}</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{outline.plotStructure}</Badge>
          {outline.themes.map((theme) => (
            <Badge key={theme} variant="secondary">
              {theme}
            </Badge>
          ))}
        </div>

        <ol className="mt-8 space-y-6 border-t border-paper-edge pt-6">
          {outline.chapters.map((chapter) => (
            <li key={chapter.number} className="grid gap-x-5 gap-y-2 sm:grid-cols-[2.5rem_1fr]">
              <span className="font-mono text-sm text-paper-muted tabular-nums sm:pt-1 sm:text-right">
                {chapter.number}
              </span>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h4 className="font-display text-lg font-semibold text-paper-foreground">
                    {chapter.title}
                  </h4>
                  <span className="font-sans text-xs text-paper-muted">
                    {ARC_LABELS[chapter.emotionalArc]} · ~{words(chapter.targetWords)} words
                  </span>
                </div>
                <p className="font-serif text-[0.95rem] leading-relaxed text-paper-foreground/90">
                  {chapter.summary}
                </p>
                {chapter.keyEvents.length > 0 ? (
                  <ul className="list-disc space-y-0.5 pl-5 font-sans text-sm text-paper-muted">
                    {chapter.keyEvents.map((event) => (
                      <li key={event}>{event}</li>
                    ))}
                  </ul>
                ) : null}
                <dl className="grid gap-1 font-sans text-xs text-paper-muted sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium">Opens: </dt>
                    <dd className="inline">{chapter.openingHook}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Closes: </dt>
                    <dd className="inline">{chapter.closingHook}</dd>
                  </div>
                </dl>
                {chapter.charactersPresent.length > 0 ? (
                  <p className="font-sans text-xs text-paper-muted">
                    With {chapter.charactersPresent.join(", ")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </article>

      {awaitingApproval && activeRun ? (
        <OutlineApprovalBar runId={activeRun.id} projectId={projectId} />
      ) : (
        <p className="text-xs text-muted-foreground">
          The outline updates as chapters are drafted — the Continuity agent flags any drift from
          it.
        </p>
      )}
    </div>
  );
}
