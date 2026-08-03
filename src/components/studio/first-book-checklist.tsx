"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Check, Circle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { track } from "@/lib/analytics/track";
import type {
  AuthoringOnboardingSnapshot,
  AuthoringOnboardingUpdate,
} from "@/lib/authoring-onboarding-shared";

export function FirstBookChecklist({
  snapshot,
  busy,
  onDismissChange,
}: {
  snapshot: AuthoringOnboardingSnapshot;
  busy: boolean;
  onDismissChange: (dismissed: boolean) => void;
}) {
  const titleId = React.useId();
  const listId = React.useId();
  const [showAllMobile, setShowAllMobile] = React.useState(false);
  const firstIncompleteIndex = snapshot.steps.findIndex((step) => !step.complete);
  const mobileMilestoneIndex =
    firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(0, snapshot.steps.length - 1);

  if (snapshot.dismissed) {
    return (
      <div className="border-y border-border py-4">
        <p className="text-sm font-medium">First-book checklist is hidden</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Your progress is still saved and can be shown again on any device.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onDismissChange(false)}
          className="mt-2 -ml-2 rounded-sm"
        >
          <RotateCcw aria-hidden="true" data-icon="inline-start" />
          Show checklist
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby={titleId} className="border-y border-border py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="font-semibold">
            Your first book
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {snapshot.completedCount} of {snapshot.steps.length} milestones complete. Progress comes
            from your saved work, not from clicking these items.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onDismissChange(true)}
          className="shrink-0 rounded-sm"
        >
          Hide
        </Button>
      </div>
      <ol id={listId} className="mt-4 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.steps.map((step, index) => (
          <li
            key={step.id}
            className={
              showAllMobile || index === mobileMilestoneIndex ? undefined : "hidden sm:block"
            }
          >
            <Link
              href={step.href as Route}
              aria-current={!step.complete && index === mobileMilestoneIndex ? "step" : undefined}
              className={`group flex min-h-11 items-start gap-3 rounded-sm px-2 py-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${
                !step.complete && index === mobileMilestoneIndex ? "bg-accent/50" : ""
              }`}
            >
              {step.complete ? (
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center bg-primary text-primary-foreground">
                  <Check aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">Complete:</span>
                </span>
              ) : (
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center">
                  <Circle aria-hidden="true" className="size-5 text-muted-foreground" />
                  <span className="sr-only">Not complete:</span>
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium">{step.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={showAllMobile}
        aria-controls={listId}
        onClick={() => setShowAllMobile((visible) => !visible)}
        className="mt-2 rounded-sm sm:hidden"
      >
        {showAllMobile ? "Show current milestone only" : "View all milestones"}
      </Button>
    </section>
  );
}

export function FirstBookChecklistLoading() {
  return (
    <div
      role="status"
      aria-label="Loading first-book progress"
      className="border-y border-border py-5"
    >
      <Skeleton className="h-5 w-36" />
      <Skeleton className="mt-2 h-3 w-56" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function StudioInlineChecklist({
  initialSnapshot,
}: {
  initialSnapshot: AuthoringOnboardingSnapshot;
}) {
  const [snapshot, setSnapshot] = React.useState(initialSnapshot);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  async function updateChecklist(update: AuthoringOnboardingUpdate) {
    if (saving) return;
    const previous = snapshot;
    const dismissed = update.action === "dismiss_checklist" ? update.dismissed : snapshot.dismissed;
    setSnapshot({ ...snapshot, dismissed });
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!response.ok) throw new Error("Could not save onboarding");
      setSnapshot((await response.json()) as AuthoringOnboardingSnapshot);
      if (update.action === "dismiss_checklist") {
        track("onboarding_checklist_changed", { dismissed: update.dismissed });
      }
    } catch {
      setSnapshot(previous);
      setError("Checklist visibility could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="First-book guidance">
      <FirstBookChecklist
        snapshot={snapshot}
        busy={saving}
        onDismissChange={(dismissed) =>
          void updateChecklist({ action: "dismiss_checklist", dismissed })
        }
      />
      <p role="status" className="mt-2 min-h-5 text-xs text-destructive">
        {error}
      </p>
    </section>
  );
}
