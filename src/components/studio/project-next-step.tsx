"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  CircleHelp,
  CircleStop,
  Coins,
  FilePenLine,
  Play,
  RefreshCcw,
  ScrollText,
  Sparkles,
} from "lucide-react";

import { useProjectProgress } from "@/components/studio/project-progress";
import { usePublishAuthoringNextAction } from "@/components/studio/authoring-journey-command";
import {
  authoringJourneyWithProgress,
  type AuthoringJourneySnapshot,
  type AuthoringNextAction,
  type AuthoringNextActionKind,
} from "@/lib/authoring-journey";
import { cn } from "@/lib/utils";

const ACTION_ICONS: Record<
  AuthoringNextActionKind,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
> = {
  complete_setup: FilePenLine,
  start_production: Play,
  recover_dispatch: RefreshCcw,
  watch_production: Sparkles,
  review_outline: ScrollText,
  add_credits: Coins,
  finish_cancellation: CircleStop,
  recover_saved_work: RefreshCcw,
  edit_manuscript: FilePenLine,
  read_or_export: BookOpenCheck,
  contact_support: CircleHelp,
  unlock_full_book: Sparkles,
};

export function JourneyActionLink({
  action,
  className,
  compact = false,
  variant = "primary",
}: {
  action: AuthoringNextAction;
  className?: string;
  compact?: boolean;
  variant?: "primary" | "secondary";
}) {
  const Icon = ACTION_ICONS[action.kind];
  return (
    <Link
      href={action.href as Route}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-primary/35 bg-primary/10 text-primary hover:bg-primary/15",
        compact && "w-full justify-between",
        className,
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 text-center leading-snug whitespace-normal">{action.label}</span>
      </span>
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
    </Link>
  );
}

function normalizedRoute(value: string): string {
  const [pathname = "/"] = value.split(/[?#]/u, 1);
  return pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
}

export function isCurrentPageCancellationAction(
  action: AuthoringNextAction,
  pathname: string | null,
): boolean {
  return (
    action.kind === "finish_cancellation" &&
    pathname !== null &&
    normalizedRoute(action.href) === normalizedRoute(pathname)
  );
}

function PassiveCancellationStatus({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border border-border bg-muted/45 px-4 text-sm font-semibold text-foreground sm:w-auto",
        className,
      )}
    >
      <CircleStop aria-hidden="true" className="size-4 shrink-0 text-ai" />
      <span>Stopping safely</span>
    </div>
  );
}

function useLiveJourney(snapshot: AuthoringJourneySnapshot): AuthoringJourneySnapshot {
  const { progress } = useProjectProgress();
  return React.useMemo(
    () => authoringJourneyWithProgress(snapshot, progress),
    [progress, snapshot],
  );
}

export function ProjectNextStep({ snapshot }: { snapshot: AuthoringJourneySnapshot }) {
  const journey = useLiveJourney(snapshot);
  const action = journey.nextAction;
  const pathname = usePathname();
  const currentPageCancellation = isCurrentPageCancellationAction(action, pathname);
  const compactMobileRecovery = action.kind === "recover_saved_work";
  const presentationLabel = currentPageCancellation ? "Stopping safely" : action.label;
  usePublishAuthoringNextAction(action);

  return (
    <section
      aria-label={`Next step: ${presentationLabel}`}
      data-compact-mobile={compactMobileRecovery ? "true" : undefined}
      className={cn(
        "instrument-surface-raised sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 grid min-w-0 gap-3 overflow-hidden rounded-sm border-l-primary px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:static lg:z-auto lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-6 lg:px-5 lg:py-4",
        compactMobileRecovery &&
          "min-h-14 gap-0 p-1.5 sm:gap-3 sm:px-4 sm:py-3 lg:gap-6 lg:px-5 lg:py-4",
      )}
    >
      <span aria-hidden="true" className="spectral-rule absolute inset-y-0 left-0 w-px" />
      <div className={cn("min-w-0", compactMobileRecovery && "hidden sm:block")}>
        <h2
          aria-label={`Next step: ${presentationLabel}`}
          aria-live="polite"
          className="text-base font-semibold tracking-[-0.015em]"
        >
          <span className="sr-only">Next step: </span>
          {presentationLabel}
        </h2>
        <p className="mt-1 hidden max-w-3xl text-xs leading-relaxed text-muted-foreground sm:block">
          {action.description}
        </p>
        {action.kind === "contact_support" ? (
          <p className="mt-2 font-mono text-[0.6875rem] text-muted-foreground">
            Support reference: {journey.supportReference}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {journey.purchaseAction ? (
          <JourneyActionLink action={journey.purchaseAction} variant="secondary" />
        ) : null}
        {currentPageCancellation ? (
          <PassiveCancellationStatus />
        ) : (
          <JourneyActionLink action={action} className="w-full sm:w-auto" />
        )}
      </div>
    </section>
  );
}

export function MobileProjectNextStep({ snapshot }: { snapshot: AuthoringJourneySnapshot }) {
  const journey = useLiveJourney(snapshot);
  const action = journey.nextAction;
  const pathname = usePathname();
  const currentPageCancellation = isCurrentPageCancellationAction(action, pathname);
  const presentationLabel = currentPageCancellation ? "Stopping safely" : action.label;
  return (
    <section aria-label={`Next step: ${presentationLabel}`} className="border-b border-border p-3">
      <h2 aria-label={`Next step: ${presentationLabel}`} className="text-sm font-semibold">
        <span className="sr-only">Next step: </span>
        {presentationLabel}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
      {action.kind === "contact_support" ? (
        <p className="mt-2 font-mono text-[0.6875rem] text-muted-foreground">
          Support reference: {journey.supportReference}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {journey.purchaseAction ? (
          <JourneyActionLink action={journey.purchaseAction} compact variant="secondary" />
        ) : null}
        {currentPageCancellation ? (
          <PassiveCancellationStatus />
        ) : (
          <JourneyActionLink action={action} compact />
        )}
      </div>
    </section>
  );
}
