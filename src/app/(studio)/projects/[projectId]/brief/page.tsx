import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefEditor } from "@/components/studio/brief-editor";
import { requireUser } from "@/lib/auth";
import { getProjectWithBook } from "@/db/queries/books";
import { TIER_LABELS } from "@/ai/models";

function words(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

const POV_LABELS = {
  first: "First person",
  third_limited: "Third person, limited",
  third_omniscient: "Third person, omniscient",
} as const;

const TENSE_LABELS = { past: "Past tense", present: "Present tense" } as const;

export default async function BriefPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();
  const { project } = data;
  const settings = project.settings;

  const paragraphs = (project.brief ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const facts = [
    { label: "Genre", value: project.genre },
    { label: "Tone", value: settings.tone },
    { label: "Point of view", value: settings.pov ? POV_LABELS[settings.pov] : null },
    { label: "Tense", value: settings.tense ? TENSE_LABELS[settings.tense] : null },
    {
      label: "Target length",
      value: `${project.targetChapters} chapters · ~${words(
        project.targetChapters * project.targetWordsPerChapter,
      )} words`,
    },
    {
      label: "Quality tier",
      value: TIER_LABELS[settings.qualityTier ?? "standard"].name,
    },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <h2 className="sr-only">Brief</h2>

      <article className="paper-surface px-6 py-8 sm:px-10 sm:py-10">
        <p className="font-sans text-xs tracking-widest text-paper-muted uppercase">
          The brief, as written
        </p>
        <div className="prose-manuscript mt-6">
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
          ) : (
            <p className="text-paper-muted italic">
              This project has no brief yet — the agents will be working from the title alone.
            </p>
          )}
        </div>
        <div className="mt-8">
          <BriefEditor projectId={projectId} brief={project.brief ?? ""} />
        </div>
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {facts.map((fact) => (
          <Card key={fact.label} size="sm">
            <CardHeader>
              <CardDescription className="text-xs tracking-widest uppercase">
                {fact.label}
              </CardDescription>
              <CardTitle className="text-sm font-medium">{fact.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
        <Card size="sm">
          <CardContent className="text-xs text-muted-foreground">
            The brief is the source of truth. Everything the agents write traces back to this page.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
