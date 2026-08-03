import type { AuthoringJourneySnapshot } from "@/lib/authoring-journey";
import type { EditorProductionStatus } from "@/lib/editor/types";

type IncompleteProductionStatus = EditorProductionStatus & {
  heading: string;
};

export function incompleteProductionStatus(
  journey: AuthoringJourneySnapshot,
): IncompleteProductionStatus | null {
  if (journey.artifacts.fullBookCompletionReady) return null;

  const interrupted =
    journey.run?.effectiveStatus === "failed" ||
    journey.run?.effectiveStatus === "cancelled" ||
    journey.run?.health === "needs_attention";
  const active =
    journey.run?.effectiveStatus === "queued" ||
    journey.run?.effectiveStatus === "running" ||
    journey.run?.effectiveStatus === "awaiting_input";
  const saved = journey.artifacts.savedChapters;
  const total = journey.artifacts.totalChapters;
  const detail =
    total > 0
      ? `${saved} of ${total} ${saved === 1 ? "chapter is" : "chapters are"} saved`
      : `${saved} ${saved === 1 ? "chapter is" : "chapters are"} saved`;

  if (interrupted) {
    return {
      label: "Production stopped early",
      heading: "Production stopped before the manuscript was finished.",
      detail,
    };
  }
  if (active) {
    return {
      label: "Production in progress",
      heading: "This manuscript is still being produced.",
      detail,
    };
  }
  return {
    label: "Partial manuscript",
    heading: "This is a partial manuscript.",
    detail,
  };
}

export function IncompleteProductionNotice({ journey }: { journey: AuthoringJourneySnapshot }) {
  const status = incompleteProductionStatus(journey);
  if (!status) return null;

  return (
    <section
      aria-labelledby="incomplete-production-title"
      className="rounded-sm border border-ember/40 bg-ember/8 px-4 py-3"
    >
      <div>
        <p className="folio-label text-foreground">Incomplete production</p>
        <h2 id="incomplete-production-title" className="mt-1 text-sm font-semibold">
          {status.heading}
        </h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          {status.detail}. {journey.nextAction.description}
        </p>
      </div>
    </section>
  );
}
