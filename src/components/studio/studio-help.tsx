"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { BookOpenCheck, ChevronDown, LifeBuoy } from "lucide-react";

import { track } from "@/lib/analytics/track";
import type {
  AuthoringOnboardingSnapshot,
  AuthoringOnboardingUpdate,
} from "@/lib/authoring-onboarding-shared";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GENRES } from "@/lib/genres";
import { useStudioHelpProjectGenre } from "@/components/studio/studio-help-context";
import {
  FirstBookChecklist,
  FirstBookChecklistLoading,
} from "@/components/studio/first-book-checklist";

type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  detail: React.ReactNode;
};

const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "From idea to manuscript",
    summary: "What Plan, Produce, Refine, and Publish mean.",
    detail: (
      <p>
        Plan holds your brief and outline. Produce builds the Story Bible and chapters. Refine is
        where you edit the prose. Publish gives you the continuous manuscript and exports. The
        highlighted destination is where you are; production status separately tells you what the
        writing system is doing.
      </p>
    ),
  },
  {
    id: "brief",
    title: "Writing a useful brief",
    summary: "A few specific details give the writing team strong direction.",
    detail: (
      <p>
        Name the main character, what they want, what stands in the way, where the story happens,
        and how you want it to feel. You do not need a polished synopsis. Your working title and
        brief remain editable.
      </p>
    ),
  },
  {
    id: "production",
    title: "Production, pauses, and recovery",
    summary: "How to tell whether work is active, waiting, or needs you.",
    detail: (
      <p>
        Write shows the last confirmed stage, chapter progress, and update time. An outline approval
        or credit pause is safe: drafted work is kept. If a start is uncertain or a run is
        interrupted, use the recovery action shown there instead of starting a duplicate book.
      </p>
    ),
  },
  {
    id: "story-bible",
    title: "Story Bible",
    summary: "The reference file for characters, places, objects, and continuity.",
    detail: (
      <p>
        The Story Bible grows as chapters are written. It records the facts the manuscript has
        established so later chapters can stay consistent. Portraits are optional visual references
        and never replace the written character profile.
      </p>
    ),
  },
  {
    id: "editor",
    title: "Editing and autosave",
    summary: "Revise directly, review suggestions, and recover earlier versions.",
    detail: (
      <p>
        Changes save automatically. Suggestions never alter the manuscript until you accept them.
        History keeps earlier chapter versions, and a conflict message appears before another tab
        can overwrite your work.
      </p>
    ),
  },
  {
    id: "credits",
    title: "Credits and the included story",
    summary: "What is included and when a purchase is needed.",
    detail: (
      <p>
        One eligible verified account can create a complete three-chapter short story without a
        card. Full-length books use prepaid credits. You see a quote before production, and paid
        work pauses at a safe boundary if the balance runs short.
      </p>
    ),
  },
  {
    id: "exports",
    title: "Reading and exporting",
    summary: "Where the finished manuscript lives.",
    detail: (
      <p>
        Manuscript is the continuous reading view. Export from there when the book is ready. If
        production is incomplete, the Studio labels the manuscript accordingly so a partial draft
        cannot be mistaken for a finished book.
      </p>
    ),
  },
];

function topicForPath(pathname: string): string {
  if (pathname === "/studio/new" || /^\/projects\/[^/]+\/brief\/?$/.test(pathname)) {
    return "brief";
  }
  if (pathname.includes("/write") || pathname.includes("/outline")) return "production";
  if (pathname.includes("/bible")) return "story-bible";
  if (pathname.includes("/editor")) return "editor";
  if (pathname.includes("/manuscript")) return "exports";
  if (pathname.includes("/credits") || pathname.includes("/usage")) return "credits";
  return "getting-started";
}

function orderedTopics(pathname: string): HelpTopic[] {
  const current = topicForPath(pathname);
  return [...HELP_TOPICS].sort((left, right) => {
    if (left.id === current) return -1;
    if (right.id === current) return 1;
    return 0;
  });
}

async function fetchChecklist(signal?: AbortSignal): Promise<AuthoringOnboardingSnapshot> {
  const response = await fetch("/api/onboarding", {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Could not load onboarding");
  return (await response.json()) as AuthoringOnboardingSnapshot;
}

export function StudioHelp({
  open,
  onOpenChange,
  pathname,
  genre = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  genre?: string | null;
}) {
  const registeredGenre = useStudioHelpProjectGenre();
  const [snapshot, setSnapshot] = React.useState<AuthoringOnboardingSnapshot | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [copyStatus, setCopyStatus] = React.useState("");
  const [journeyGenre, setJourneyGenre] = React.useState<string | null>(null);
  const openedFor = React.useRef<string | null>(null);
  const helpProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  async function retryChecklist() {
    setLoadError(false);
    try {
      setSnapshot(await fetchChecklist());
    } catch {
      setLoadError(true);
    }
  }

  React.useEffect(() => {
    if (!open) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current !== pathname) {
      openedFor.current = pathname;
      track("help_opened", { area: topicForPath(pathname) });
    }
    const controller = new AbortController();
    void fetchChecklist(controller.signal).then(
      (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setLoadError(false);
      },
      (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
      },
    );
    return () => controller.abort();
  }, [open, pathname]);

  React.useEffect(() => {
    if (!open || !helpProjectId || genre || registeredGenre) return;
    const controller = new AbortController();
    void fetch(`/api/projects/${helpProjectId}/journey`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          journey?: { project?: { genre?: string | null } };
        };
        setJourneyGenre(payload.journey?.project?.genre ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [genre, helpProjectId, open, registeredGenre]);

  async function updateChecklist(update: AuthoringOnboardingUpdate) {
    if (!snapshot || saving) return;
    const previous = snapshot;
    const dismissed = update.action === "dismiss_checklist" ? update.dismissed : snapshot.dismissed;
    setSnapshot({ ...snapshot, dismissed });
    setSaving(true);
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
      setLoadError(true);
    } finally {
      setSaving(false);
    }
  }

  async function copySupportDetails() {
    const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
    const details = [
      "sopher.ai Studio support",
      `Page: ${pathname}`,
      ...(projectId ? [`Project: ${projectId}`] : []),
    ];
    if (projectId) {
      try {
        const response = await fetch(`/api/projects/${projectId}/journey`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          journey?: {
            run?: {
              id?: string;
              databaseStatus?: string;
              workflowStatus?: string | null;
              effectiveStatus?: string;
              stage?: string;
              acceptedAt?: string;
              lastUpdateAt?: string;
              supportReference?: string;
            } | null;
          };
        } | null;
        const run = response.ok ? payload?.journey?.run : null;
        if (run) {
          if (run.id) details.push(`Run: ${run.id}`);
          if (run.databaseStatus) details.push(`Database status: ${run.databaseStatus}`);
          details.push(`Workflow status: ${run.workflowStatus ?? "unknown"}`);
          if (run.effectiveStatus) details.push(`Effective status: ${run.effectiveStatus}`);
          if (run.stage) details.push(`Stage: ${run.stage}`);
          if (run.acceptedAt) details.push(`Accepted: ${run.acceptedAt}`);
          if (run.lastUpdateAt) details.push(`Last update: ${run.lastUpdateAt}`);
          if (run.supportReference) details.push(`Support reference: ${run.supportReference}`);
        }
      } catch {
        // The base page/project diagnostic is still useful offline.
      }
    }
    details.push(`Captured: ${new Date().toISOString()}`);
    try {
      await navigator.clipboard.writeText(details.join("\n"));
      setCopyStatus("Support details copied.");
    } catch {
      setCopyStatus("Could not copy. Include the page address when you email support.");
    }
  }

  const currentTopic = topicForPath(pathname);
  const supportSubject = encodeURIComponent(
    `Studio help${pathname.startsWith("/projects/") ? ` — ${pathname.split("/")[3] ?? "project"}` : ""}`,
  );
  const genreGuide = GENRES.find(
    (option) => option.id === (genre ?? registeredGenre ?? (helpProjectId ? journeyGenre : null)),
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setCopyStatus("");
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side="right"
        className="h-dvh w-[min(94vw,30rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[30rem]"
      >
        <SheetHeader className="border-b border-border px-5 py-5 pr-14 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <LifeBuoy aria-hidden="true" className="size-5 text-primary" />
            Help with this page
          </SheetTitle>
          <SheetDescription>
            Clear guidance for writing, production, editing, and recovery.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {snapshot ? (
            <FirstBookChecklist
              snapshot={snapshot}
              busy={saving}
              onDismissChange={(dismissed) =>
                void updateChecklist({ action: "dismiss_checklist", dismissed })
              }
            />
          ) : loadError ? (
            <div role="alert" className="border-y border-border py-5">
              <p className="text-sm font-medium">Checklist progress could not be loaded.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The help topics below are still available.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void retryChecklist()}
                className="mt-3 rounded-sm"
              >
                Try again
              </Button>
            </div>
          ) : (
            <FirstBookChecklistLoading />
          )}

          <section aria-labelledby="help-topics-title" className="pt-6">
            <h3 id="help-topics-title" className="font-semibold">
              Help topics
            </h3>
            <div className="mt-3 border-t border-border">
              {orderedTopics(pathname).map((topic) => (
                <details
                  key={topic.id}
                  className="group border-b border-border"
                  open={topic.id === currentTopic}
                >
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-3 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{topic.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {topic.summary}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <div className="pb-4 text-sm leading-relaxed text-muted-foreground">
                    {topic.detail}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section aria-labelledby="more-help-title" className="pt-7">
            <h3 id="more-help-title" className="font-semibold">
              Still need help?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Copy safe diagnostics, then email support. They include only IDs, statuses, and
              timestamps for this page—never your brief, approval notes, or manuscript.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void copySupportDetails()}>
                Copy support details
              </Button>
              <Button
                nativeButton={false}
                render={<a href={`mailto:support@sopher.ai?subject=${supportSubject}`} />}
              >
                Email support
              </Button>
              <Button
                variant="ghost"
                nativeButton={false}
                render={
                  <Link
                    href={
                      genreGuide
                        ? (`/genres/${genreGuide.id.replaceAll("_", "-")}` as Route)
                        : "/guides"
                    }
                  />
                }
              >
                <BookOpenCheck aria-hidden="true" data-icon="inline-start" />
                {genreGuide ? `${genreGuide.name} craft guide` : "Writing guides"}
              </Button>
              {genreGuide ? (
                <Button variant="ghost" nativeButton={false} render={<Link href="/guides" />}>
                  All writing guides
                </Button>
              ) : null}
            </div>
            <p
              role="status"
              aria-live="polite"
              className="mt-2 min-h-5 text-xs text-muted-foreground"
            >
              {copyStatus}
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
