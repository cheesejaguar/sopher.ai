import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RelativeTime } from "@/components/relative-time";
import { genreLabel } from "@/lib/genres";
import { ProjectMenu } from "@/components/studio/project-menu";
import { CREDIT_MARKUP } from "@/lib/billing/credits-shared";
import {
  FULL_BOOK_UNLOCK_DESCRIPTION,
  FULL_BOOK_UNLOCK_HREF,
  fullBookUnlockHref,
  INCLUDED_STORY_NO_CARD_NOTE,
} from "@/lib/marketing/trial-offer";
import { journeyStatusLabel, type AuthoringNextAction } from "@/lib/authoring-journey";

export type ProjectCardStatus = "draft" | "generating" | "editing" | "complete" | "archived";

/** Serializable card shape, assembled from the DB by the dashboard. */
export interface ProjectCardData {
  id: string;
  title: string;
  genre: string | null;
  status: ProjectCardStatus;
  /** ISO timestamp of the last change to the book. */
  updatedAt: string;
  wordCount: number;
  chaptersDone: number;
  chaptersTotal: number;
  /** Net author-facing ledger debit, after delivery refunds. */
  creditsUsed: number;
  estimateUsd: number;
  nextAction: AuthoringNextAction;
  /** Internal project surface that explains the current run state. */
  statusHref: string;
  archived?: boolean;
}

function projectCardDestination(project: ProjectCardData): { href: string; label: string } {
  if (project.nextAction.kind === "contact_support") {
    return {
      href: project.statusHref,
      label: "Review production status",
    };
  }
  return {
    href: project.nextAction.href,
    label: project.nextAction.label,
  };
}

function formatSpendCredits(value: number): string {
  return `${(value * CREDIT_MARKUP).toFixed(1)} cr`;
}

function formatCredits(value: number): string {
  return `${value.toFixed(1)} cr`;
}

function journeyNeedsAttention(action: AuthoringNextAction): boolean {
  return (
    action.kind === "contact_support" ||
    action.kind === "recover_saved_work" ||
    action.kind === "recover_dispatch" ||
    action.kind === "add_credits"
  );
}

function JourneyStatusBadge({ action }: { action: AuthoringNextAction }) {
  const needsAttention = journeyNeedsAttention(action);
  const active = action.kind === "watch_production" || action.kind === "finish_cancellation";
  const complete = action.kind === "read_or_export";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-sm",
        needsAttention && "bg-destructive/12 text-destructive",
        active && "bg-ai-soft text-ai",
        complete && "bg-success/15 text-success",
      )}
    >
      {active ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {journeyStatusLabel(action)}
    </Badge>
  );
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const progress =
    project.chaptersTotal > 0 ? (project.chaptersDone / project.chaptersTotal) * 100 : 0;
  const needsAttention = journeyNeedsAttention(project.nextAction);
  const destination = projectCardDestination(project);

  return (
    <div className="group relative h-full">
      {/* The menu floats above the link so it is clickable without nesting
          interactive elements inside the anchor. */}
      <div className="absolute top-3 right-3 z-10">
        <ProjectMenu projectId={project.id} title={project.title} archived={project.archived} />
      </div>
      <Link
        href={destination.href as Route}
        aria-label={`${destination.label}: ${project.title}`}
        className="instrument-surface relative flex h-full min-h-36 flex-col overflow-hidden rounded-sm p-4 transition-colors hover:border-foreground/30 md:min-h-64 md:p-5"
      >
        <span
          aria-hidden="true"
          className="spectral-rule absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        />
        <span
          aria-hidden="true"
          className="absolute top-10 right-5 hidden h-24 w-16 border border-border/70 bg-background/30 shadow-[4px_4px_0_var(--border)] transition-transform duration-300 group-hover:-translate-y-1 md:block"
        >
          <span className="absolute top-4 right-3 left-3 h-px bg-border" />
          <span className="absolute top-7 right-3 left-3 h-px bg-border" />
          <span className="absolute top-10 right-5 left-3 h-px bg-border" />
        </span>

        <div className="relative pr-10 md:pr-20">
          <h2 className="text-lg leading-snug font-semibold tracking-[-0.02em] text-balance [overflow-wrap:anywhere]">
            {project.title}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {project.genre ? (
              <Badge variant="outline" className="rounded-sm capitalize">
                {genreLabel(project.genre)}
              </Badge>
            ) : null}
            {project.archived ? (
              <Badge variant="secondary" className="rounded-sm bg-muted text-muted-foreground">
                Archived
              </Badge>
            ) : (
              <JourneyStatusBadge action={project.nextAction} />
            )}
          </div>
        </div>
        <p
          className={cn(
            "relative mt-3 pr-10 text-xs leading-relaxed text-muted-foreground md:mt-4 md:line-clamp-none md:pr-20",
            !needsAttention && "line-clamp-2",
          )}
        >
          {project.nextAction.description}
        </p>

        <div className="mt-auto pt-4 md:pt-8">
          <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
            <div>
              <p className="folio-label text-muted-foreground">Production</p>
              <p className="mt-1 font-mono text-sm tabular-nums">
                {project.chaptersDone}
                <span className="text-muted-foreground"> / {project.chaptersTotal} chapters</span>
              </p>
            </div>
            <div className="text-right">
              <p className="folio-label text-muted-foreground md:hidden">Credits used</p>
              <p className="mt-1 font-mono text-sm tabular-nums md:hidden">
                {formatCredits(project.creditsUsed)}
              </p>
              <p className="folio-label hidden text-muted-foreground md:block">Length</p>
              <p className="mt-1 hidden font-mono text-sm tabular-nums md:block">
                {new Intl.NumberFormat("en-US").format(project.wordCount)} words
              </p>
            </div>
          </div>
          <div className="py-3 md:py-3">
            <Progress
              value={progress}
              aria-label={`Chapters saved: ${project.chaptersDone} of ${project.chaptersTotal}`}
              className="h-1"
            />
          </div>
          <div className="flex items-end justify-end gap-4 border-t border-border pt-3 text-xs md:justify-between">
            <span className="hidden md:block">
              <span className="folio-label block text-muted-foreground">Credits used</span>
              <span className="mt-1 block font-mono tabular-nums">
                {formatCredits(project.creditsUsed)}{" "}
                <span className="text-muted-foreground">
                  / ~{formatSpendCredits(project.estimateUsd)}
                </span>
              </span>
            </span>
            <span className="max-w-36 text-right text-muted-foreground">
              <span className="block font-medium text-foreground">{destination.label}</span>
              <span className="mt-1 block">
                Updated <RelativeTime iso={project.updatedAt} />
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="ml-1 inline size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export function FeaturedProjectCard({ project }: { project: ProjectCardData }) {
  const progress =
    project.chaptersTotal > 0 ? (project.chaptersDone / project.chaptersTotal) * 100 : 0;
  const destination = projectCardDestination(project);

  return (
    <div className="group relative">
      <div className="absolute top-4 right-4 z-10">
        <ProjectMenu projectId={project.id} title={project.title} archived={project.archived} />
      </div>
      <Link
        href={destination.href as Route}
        aria-label={`${destination.label}: ${project.title}`}
        className="instrument-surface-raised relative grid min-h-72 overflow-hidden rounded-sm transition-colors hover:border-foreground/30 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]"
      >
        <span aria-hidden="true" className="spectral-rule absolute inset-y-0 left-0 w-px" />
        <div className="flex min-w-0 flex-col justify-between p-6 sm:p-8">
          <div>
            <h2 className="max-w-3xl pr-8 text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl">
              {project.title}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {project.genre ? (
                <Badge variant="outline" className="rounded-sm capitalize">
                  {genreLabel(project.genre)}
                </Badge>
              ) : null}
              <JourneyStatusBadge action={project.nextAction} />
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {project.nextAction.description}
            </p>
          </div>
          <span className="mt-8 inline-flex min-h-11 w-fit items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground">
            {destination.label}
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </span>
        </div>

        <div className="instrument-canvas flex min-w-0 flex-col justify-end border-t border-border p-6 md:border-t-0 md:border-l sm:p-8">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="folio-label text-muted-foreground">Production progress</p>
              <p className="mt-2 font-mono text-xl font-semibold tabular-nums">
                {project.chaptersDone}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {project.chaptersTotal} chapters
                </span>
              </p>
            </div>
            <span
              aria-hidden="true"
              className={cn(
                "manuscript-sheet hidden h-24 w-16 sm:block",
                project.status === "generating" && "border-ai",
              )}
            >
              <span className="absolute top-5 right-3 left-3 h-px bg-paper-edge" />
              <span className="absolute top-8 right-3 left-3 h-px bg-paper-edge" />
              <span className="absolute top-11 right-5 left-3 h-px bg-paper-edge" />
            </span>
          </div>
          <Progress
            value={progress}
            aria-label={`Chapters saved: ${project.chaptersDone} of ${project.chaptersTotal}`}
            className="h-1"
          />
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs">
            <div>
              <span className="folio-label block text-muted-foreground">Credits used</span>
              <span className="mt-1 block font-mono tabular-nums">
                {formatCredits(project.creditsUsed)}
                <span className="text-muted-foreground">
                  {" "}
                  / ~{formatSpendCredits(project.estimateUsd)}
                </span>
              </span>
            </div>
            <div className="text-right">
              <span className="folio-label block text-muted-foreground">Last activity</span>
              <span className="mt-1 block text-muted-foreground">
                <RelativeTime iso={project.updatedAt} />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

export function NewBookCard({
  unlockFullBooks = false,
  sourceProjectId,
}: {
  unlockFullBooks?: boolean;
  sourceProjectId?: string;
}) {
  const href = unlockFullBooks
    ? sourceProjectId
      ? fullBookUnlockHref(sourceProjectId)
      : FULL_BOOK_UNLOCK_HREF
    : "/studio/new";

  return (
    <Link
      href={href}
      className="group relative flex h-full min-h-64 flex-col justify-between overflow-hidden rounded-sm border border-border border-l-primary bg-instrument p-5 text-foreground transition-colors hover:border-primary/55 hover:bg-instrument-high"
    >
      <span
        aria-hidden="true"
        data-slot="new-book-decoration"
        className="pointer-events-none relative flex items-center"
      >
        <span className="grid size-11 shrink-0 place-items-center border border-primary/35 bg-primary/10 text-primary">
          {unlockFullBooks ? <ArrowUpRight className="size-4" /> : <Plus className="size-4" />}
        </span>
        <span className="ml-4 h-px flex-1 bg-primary/12" />
        <span className="absolute inset-y-0 right-10 w-px bg-primary/12" />
      </span>
      <span data-slot="new-book-copy" className="relative">
        <span className="block text-xl font-semibold tracking-[-0.02em]">
          {unlockFullBooks ? "Take your story to full length" : "Start a new book"}
        </span>
        <span className="mt-2 block max-w-sm text-sm leading-relaxed text-muted-foreground">
          {unlockFullBooks
            ? `${INCLUDED_STORY_NO_CARD_NOTE} ${FULL_BOOK_UNLOCK_DESCRIPTION} Its title, genre, and brief will carry into the new full-length setup.`
            : "Four clear steps from your idea to a credit quote. Nothing runs until you approve it."}
        </span>
      </span>
    </Link>
  );
}
