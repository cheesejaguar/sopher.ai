"use client";

import * as React from "react";

import {
  describeProductionProgress,
  isActiveProductionProgress,
  isProjectProgressSnapshot,
  type ProjectProgressSnapshot,
} from "@/lib/project-progress";

export const PROJECT_PROGRESS_POLL_MS = 5_000;

type ProjectProgressContextValue = {
  progress: ProjectProgressSnapshot;
  publishProgress: (next: ProjectProgressSnapshot) => void;
};

const ProjectProgressContext = React.createContext<ProjectProgressContextValue | null>(null);

export function ProjectProgressProvider({
  projectId,
  initialProgress,
  children,
}: {
  projectId: string;
  initialProgress: ProjectProgressSnapshot;
  children: React.ReactNode;
}) {
  const [progress, setProgress] = React.useState(initialProgress);
  const [pollAnnouncement, setPollAnnouncement] = React.useState("");
  const lastPublishedAtRef = React.useRef(0);
  const active = isActiveProductionProgress(progress);

  const publishProgress = React.useCallback((next: ProjectProgressSnapshot) => {
    lastPublishedAtRef.current = Date.now();
    setPollAnnouncement("");
    setProgress(next);
  }, []);

  React.useEffect(() => {
    if (!active) return;

    let stopped = false;
    let polling = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let shouldContinue = true;

    function schedule(delay = PROJECT_PROGRESS_POLL_MS) {
      if (stopped || !shouldContinue) return;
      timer = window.setTimeout(() => {
        void poll();
      }, delay);
    }

    async function poll() {
      if (stopped || polling) return;
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      // The Write surface publishes its stream directly into this provider.
      // Let that fresher source win and use polling as a quiet-page fallback.
      if (Date.now() - lastPublishedAtRef.current <= PROJECT_PROGRESS_POLL_MS) {
        schedule();
        return;
      }

      polling = true;
      controller = new AbortController();
      try {
        const response = await fetch(`/api/projects/${projectId}/progress`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          shouldContinue = false;
          return;
        }
        if (!response.ok) return;

        const body: unknown = await response.json();
        const next =
          body && typeof body === "object" && "progress" in body
            ? (body as { progress?: unknown }).progress
            : undefined;
        if (stopped || !isProjectProgressSnapshot(next)) return;

        shouldContinue = isActiveProductionProgress(next);
        setProgress(next);
        setPollAnnouncement(describeProductionProgress(next));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      } finally {
        polling = false;
        controller = null;
        schedule();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || polling) return;
      if (timer !== undefined) window.clearTimeout(timer);
      schedule(0);
    }

    schedule();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active, projectId]);

  const value = React.useMemo(() => ({ progress, publishProgress }), [progress, publishProgress]);

  return (
    <ProjectProgressContext.Provider value={value}>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {pollAnnouncement}
      </p>
      {children}
    </ProjectProgressContext.Provider>
  );
}

export function useProjectProgress(): ProjectProgressContextValue {
  const value = React.useContext(ProjectProgressContext);
  if (!value) {
    throw new Error("useProjectProgress must be used inside ProjectProgressProvider");
  }
  return value;
}
