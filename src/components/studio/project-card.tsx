import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/studio/status-badge";
import { RelativeTime } from "@/components/relative-time";
import { genreLabel } from "@/lib/genres";
import { ProjectMenu } from "@/components/studio/project-menu";
import { CREDIT_MARKUP } from "@/lib/billing/credits-shared";

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
  spendUsd: number;
  estimateUsd: number;
  archived?: boolean;
}

/** The workspace stage a book naturally opens on, given its status. */
function stageForStatus(status: ProjectCardStatus): "brief" | "write" | "editor" | "manuscript" {
  switch (status) {
    case "draft":
      return "brief";
    case "generating":
      return "write";
    case "editing":
      return "editor";
    case "complete":
      return "manuscript";
    case "archived":
      // Read-only stroll through what exists; brief is the safest landing.
      return "brief";
  }
}

function formatSpendCredits(value: number): string {
  return `${(value * CREDIT_MARKUP).toFixed(1)} cr`;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const progress =
    project.chaptersTotal > 0 ? (project.chaptersDone / project.chaptersTotal) * 100 : 0;

  return (
    <div className="group relative h-full">
      {/* The menu floats above the link so it is clickable without nesting
          interactive elements inside the anchor. */}
      <div className="absolute top-3 right-3 z-10">
        <ProjectMenu projectId={project.id} title={project.title} archived={project.archived} />
      </div>
      <Link
        href={`/projects/${project.id}/${stageForStatus(project.status)}`}
        className="instrument-surface-raised relative flex h-full min-h-64 flex-col overflow-hidden rounded-sm p-5 transition-colors hover:border-foreground/30"
      >
        <span
          aria-hidden="true"
          className="spectral-rule absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        />
        <span
          aria-hidden="true"
          className="absolute top-10 right-5 h-24 w-16 border border-border/70 bg-background/30 shadow-[4px_4px_0_var(--border)] transition-transform duration-300 group-hover:-translate-y-1"
        >
          <span className="absolute top-4 right-3 left-3 h-px bg-border" />
          <span className="absolute top-7 right-3 left-3 h-px bg-border" />
          <span className="absolute top-10 right-5 left-3 h-px bg-border" />
        </span>

        <div className="relative pr-20">
          <p className="folio-label text-muted-foreground">Manuscript / project</p>
          <h2 className="mt-3 text-lg leading-snug font-semibold tracking-[-0.02em] text-balance">
            {project.title}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {project.genre ? (
              <Badge variant="outline" className="rounded-sm capitalize">
                {genreLabel(project.genre)}
              </Badge>
            ) : null}
            <StatusBadge status={project.status} className="rounded-sm" />
          </div>
        </div>

        <div className="mt-auto pt-8">
          <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
            <div>
              <p className="folio-label text-muted-foreground">Production</p>
              <p className="mt-1 font-mono text-sm tabular-nums">
                {project.chaptersDone}
                <span className="text-muted-foreground"> / {project.chaptersTotal} chapters</span>
              </p>
            </div>
            <div className="text-right">
              <p className="folio-label text-muted-foreground">Length</p>
              <p className="mt-1 font-mono text-sm tabular-nums">
                {new Intl.NumberFormat("en-US").format(project.wordCount)} words
              </p>
            </div>
          </div>
          <div className="py-3">
            <Progress
              value={progress}
              aria-label={`Chapters completed: ${project.chaptersDone} of ${project.chaptersTotal}`}
              className="h-1"
            />
          </div>
          <div className="flex items-end justify-between gap-4 border-t border-border pt-3 text-xs">
            <span>
              <span className="folio-label block text-muted-foreground">Credits used</span>
              <span className="mt-1 block font-mono tabular-nums">
                {formatSpendCredits(project.spendUsd)}{" "}
                <span className="text-muted-foreground">
                  / ~{formatSpendCredits(project.estimateUsd)}
                </span>
              </span>
            </span>
            <span className="text-right text-muted-foreground">
              Updated <RelativeTime iso={project.updatedAt} />
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
  const stage = stageForStatus(project.status);
  const stageLabel =
    stage === "brief"
      ? "Open the brief"
      : stage === "write"
        ? "Watch production"
        : stage === "editor"
          ? "Continue editing"
          : "Read the manuscript";

  return (
    <div className="group relative">
      <div className="absolute top-4 right-4 z-10">
        <ProjectMenu projectId={project.id} title={project.title} archived={project.archived} />
      </div>
      <Link
        href={`/projects/${project.id}/${stage}`}
        className="instrument-surface-raised relative grid min-h-72 overflow-hidden rounded-sm transition-colors hover:border-foreground/30 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]"
      >
        <span aria-hidden="true" className="spectral-rule absolute inset-y-0 left-0 w-px" />
        <div className="flex min-w-0 flex-col justify-between p-6 sm:p-8">
          <div>
            <p className="folio-label text-primary">Continue where you left off</p>
            <h2 className="mt-5 max-w-3xl pr-8 text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl">
              {project.title}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {project.genre ? (
                <Badge variant="outline" className="rounded-sm capitalize">
                  {genreLabel(project.genre)}
                </Badge>
              ) : null}
              <StatusBadge status={project.status} className="rounded-sm" />
            </div>
          </div>
          <span className="mt-8 inline-flex min-h-11 w-fit items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground">
            {stageLabel}
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
            aria-label={`Chapters completed: ${project.chaptersDone} of ${project.chaptersTotal}`}
            className="h-1"
          />
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs">
            <div>
              <span className="folio-label block text-muted-foreground">Credits used</span>
              <span className="mt-1 block font-mono tabular-nums">
                {formatSpendCredits(project.spendUsd)}
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

export function NewBookCard() {
  return (
    <Link
      href="/studio/new"
      className="group relative flex h-full min-h-64 flex-col justify-between overflow-hidden rounded-sm border border-border border-l-primary bg-instrument p-5 text-foreground transition-colors hover:border-primary/55 hover:bg-instrument-high"
    >
      <span aria-hidden="true" className="absolute inset-y-0 right-10 w-px bg-primary/12" />
      <span aria-hidden="true" className="absolute right-0 bottom-12 left-0 h-px bg-primary/12" />
      <span className="folio-label text-primary">New production</span>
      <span className="relative grid size-11 place-items-center border border-primary/35 bg-primary/10 text-primary">
        <Plus aria-hidden="true" className="size-4" />
      </span>
      <span className="relative">
        <span className="block text-xl font-semibold tracking-[-0.02em]">Start a new book</span>
        <span className="mt-2 block max-w-sm text-sm leading-relaxed text-muted-foreground">
          Four clear steps from your idea to a credit quote. Nothing runs until you approve it.
        </span>
      </span>
    </Link>
  );
}
