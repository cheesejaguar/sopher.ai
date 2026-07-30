"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  describeProductionProgress,
  lifecyclePhaseForProduction,
  type ProjectProgressSnapshot,
} from "@/lib/project-progress";
import { useProjectProgress } from "@/components/studio/project-progress";

const lifecycle = [
  {
    label: "Plan",
    stages: [
      { slug: "brief", label: "Brief" },
      { slug: "outline", label: "Outline" },
    ],
  },
  {
    label: "Produce",
    stages: [
      { slug: "bible", label: "Story bible" },
      { slug: "write", label: "Write" },
    ],
  },
  {
    label: "Refine",
    stages: [{ slug: "editor", label: "Editor" }],
  },
  {
    label: "Publish",
    stages: [{ slug: "manuscript", label: "Manuscript" }],
  },
] as const;

const secondary = [
  { slug: "usage", label: "Usage" },
  { slug: "settings", label: "Settings" },
] as const;

type StageSlug =
  "brief" | "outline" | "bible" | "write" | "editor" | "manuscript" | "usage" | "settings";

type Stage = { slug: StageSlug; label: string };

function getStageState(projectId: string, pathname: string | undefined, stage: Stage) {
  const href = `/projects/${projectId}/${stage.slug}` as Route;
  const current =
    pathname === undefined
      ? undefined
      : pathname === href
        ? ("page" as const)
        : pathname.startsWith(`${href}/`)
          ? ("page" as const)
          : undefined;

  return { href, current, active: current !== undefined };
}

function DesktopStageTabs({
  projectId,
  pathname,
  progress,
}: {
  projectId: string;
  pathname?: string;
  progress: ProjectProgressSnapshot;
}) {
  const productionPhase = lifecyclePhaseForProduction(progress.stage, progress.pausedStage);

  function stageLink(stage: Stage) {
    const { href, current, active } = getStageState(projectId, pathname, stage);

    return (
      <Link
        key={stage.slug}
        href={href}
        aria-current={current}
        className={cn(
          "relative inline-flex min-h-11 items-center rounded-sm px-2.5 text-[0.78rem] font-medium whitespace-nowrap transition-colors lg:min-h-9",
          active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        {active ? <span className="sr-only">You are here: </span> : null}
        <span
          aria-hidden="true"
          className={cn("absolute inset-x-2 bottom-0 h-px bg-transparent", active && "bg-primary")}
        />
        {stage.label}
      </Link>
    );
  }

  return (
    <div className="flex min-w-max items-stretch gap-3 lg:min-w-0 lg:flex-wrap">
      {lifecycle.map((group, index) => (
        <div
          key={group.label}
          className={cn(
            "flex items-center gap-1 border-r border-border pr-3 last:border-r-0",
            progress.runId && productionPhase === group.label && "text-ai",
          )}
        >
          <span className="mr-1 flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
            {progress.runId && productionPhase === group.label ? (
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-ai motion-safe:animate-pulse"
              />
            ) : null}
            <span className="text-primary">{String(index + 1).padStart(2, "0")}</span>
            {group.label}
          </span>
          {group.stages.map(stageLink)}
        </div>
      ))}
      <div className="flex items-center gap-1 border-l border-border pl-3">
        <span className="mr-1 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
          Project tools
        </span>
        {secondary.map(stageLink)}
      </div>
    </div>
  );
}

function MobileStageMenu({
  projectId,
  pathname,
  progress,
}: {
  projectId: string;
  pathname?: string;
  progress: ProjectProgressSnapshot;
}) {
  const [openOnPathname, setOpenOnPathname] = useState<string | null>(null);
  const menuPathname = pathname ?? "";
  const open = openOnPathname === menuPathname;
  const activeStage =
    lifecycle
      .flatMap((group) => group.stages.map((stage) => ({ group: group.label, ...stage })))
      .find((stage) => getStageState(projectId, pathname, stage).active) ??
    secondary
      .map((stage) => ({ group: "Project tools", ...stage }))
      .find((stage) => getStageState(projectId, pathname, stage).active);

  function mobileLink(stage: Stage) {
    const { href, current, active } = getStageState(projectId, pathname, stage);
    return (
      <Link
        key={stage.slug}
        href={href}
        aria-current={current}
        onClick={() => setOpenOnPathname(null)}
        className={cn(
          "grid min-h-11 grid-cols-[1fr_auto] items-center border-l-2 px-3 text-sm font-medium",
          active
            ? "border-primary bg-accent text-foreground"
            : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        {stage.label}
        {active ? (
          <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-ai uppercase">
            You are here
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpenOnPathname(event.currentTarget.open ? menuPathname : null)}
      className="group lg:hidden"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-2 marker:content-none">
        <span className="min-w-0">
          <span className="folio-label block text-muted-foreground">Project navigation</span>
          <span className="mt-1 block truncate text-sm font-semibold">
            {activeStage
              ? `You are here: ${activeStage.group} / ${activeStage.label}`
              : "Choose a stage"}
          </span>
          <span className="mt-1 block truncate text-xs text-ai">
            Production now: {progress.runId ? describeProductionProgress(progress) : "Not started"}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border bg-background p-3">
        {lifecycle.map((group, index) => (
          <section key={group.label} aria-label={group.label} className="mt-3 first:mt-0">
            <p className="folio-label px-3 pb-1 text-muted-foreground">
              <span className="mr-2 text-ai">{String(index + 1).padStart(2, "0")}</span>
              {group.label}
            </p>
            <div>{group.stages.map(mobileLink)}</div>
          </section>
        ))}
        <section aria-label="Project tools" className="mt-4 border-t border-border pt-3">
          <p className="folio-label px-3 pb-1 text-muted-foreground">Project tools</p>
          <div>{secondary.map(mobileLink)}</div>
        </section>
      </div>
    </details>
  );
}

function StageNavigationWithPathname({
  projectId,
  progress,
}: {
  projectId: string;
  progress: ProjectProgressSnapshot;
}) {
  const pathname = usePathname();
  return (
    <>
      <MobileStageMenu projectId={projectId} pathname={pathname} progress={progress} />
      <div className="hidden px-2 py-2 lg:block">
        <DesktopStageTabs projectId={projectId} pathname={pathname} progress={progress} />
      </div>
    </>
  );
}

export function StageNav({ projectId }: { projectId: string }) {
  const { progress } = useProjectProgress();
  const productionPhase = lifecyclePhaseForProduction(progress.stage, progress.pausedStage);

  return (
    <nav aria-label="Project lifecycle" className="min-w-0 border-y border-border bg-card/35">
      <Suspense
        fallback={
          <>
            <div className="flex min-h-12 items-center px-4 lg:hidden">
              <span className="folio-label text-muted-foreground">Project navigation</span>
            </div>
            <div className="hidden px-2 py-2 lg:block">
              <DesktopStageTabs projectId={projectId} progress={progress} />
            </div>
          </>
        }
      >
        <StageNavigationWithPathname projectId={projectId} progress={progress} />
      </Suspense>
      <div
        aria-label="Book production status"
        className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-xs"
      >
        <span className="folio-label text-muted-foreground">Production now</span>
        <span className="font-medium text-foreground">
          {progress.runId ? describeProductionProgress(progress) : "Not started"}
        </span>
        {progress.runId ? (
          <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-ai uppercase">
            {productionPhase}
          </span>
        ) : null}
      </div>
    </nav>
  );
}
