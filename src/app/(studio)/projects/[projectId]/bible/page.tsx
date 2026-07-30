import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { EntityCard } from "@/components/bible/entity-card";
import { requireUser } from "@/lib/auth";
import { getProjectWithBook } from "@/db/queries/books";
import { listEntities, openContradictions } from "@/db/queries/entities";
import { ENTITY_KINDS, type EntityKind } from "@/ai/schemas/entities";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<EntityKind, string> = {
  character: "Characters",
  location: "Locations",
  object: "Objects",
  organization: "Organizations",
  event: "Events",
};

export default async function BiblePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();
  const { book } = data;

  const [entities, contradictions] = await Promise.all([
    book ? listEntities(book.id) : Promise.resolve([]),
    book ? openContradictions(book.id) : Promise.resolve([]),
  ]);

  if (entities.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">Story bible</h2>
        <div className="manuscript-sheet flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p aria-hidden="true" className="text-2xl text-paper-muted">
            ⁂
          </p>
          <h3 className="font-display text-lg font-semibold text-paper-foreground">
            Nothing recorded yet
          </h3>
          <p className="max-w-md font-serif text-paper-muted italic">
            The bible fills in as your book is written — the cast and world are established before
            drafting, then every chapter adds what it establishes.
          </p>
        </div>
      </div>
    );
  }

  /** Contradictions are per-book; match them to entities by name mention. */
  const contradictionsFor = (name: string) =>
    contradictions.filter((issue) => issue.description.toLowerCase().includes(name.toLowerCase()));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Story bible</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Canon every chapter must honor. {entities.length}{" "}
            {entities.length === 1 ? "entry" : "entries"}.
          </p>
        </div>
        {contradictions.length > 0 ? (
          <Badge variant="destructive">
            {contradictions.length} open {contradictions.length === 1 ? "conflict" : "conflicts"}
          </Badge>
        ) : null}
      </header>

      {ENTITY_KINDS.map((kind) => {
        const group = entities.filter((e) => e.kind === kind);
        if (group.length === 0) return null;
        return (
          <section
            key={kind}
            aria-labelledby={`bible-${kind}`}
            className="grid gap-4 border-t border-border pt-5 xl:grid-cols-[9rem_minmax(0,1fr)]"
          >
            <h3
              id={`bible-${kind}`}
              className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase"
            >
              {KIND_LABELS[kind]} · {group.length}
            </h3>
            <ul
              className={cn(
                "grid min-w-0 gap-4",
                group.length > 1 && "sm:grid-cols-2",
                group.length > 2 && kind !== "character" && "2xl:grid-cols-3",
              )}
            >
              {group.map((entity) => (
                <li key={entity.id} className="min-w-0">
                  <EntityCard entity={entity} conflicts={contradictionsFor(entity.name)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
