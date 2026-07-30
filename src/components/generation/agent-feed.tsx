"use client";

import { cn } from "@/lib/utils";
import type { AgentFeedItem, AgentName, RunConnection } from "@/hooks/use-run-stream";

const AGENT_LABELS: Record<AgentName, string> = {
  concept: "Concept",
  outliner: "Outliner",
  "entity-bible": "Story bible",
  writer: "Writer",
  editor: "Editor",
  continuity: "Continuity",
  summarizer: "Summarizer",
};

/** The agents' working notes, newest first. Capped upstream at 100 entries. */
export function AgentFeed({
  items,
  connection,
}: {
  items: AgentFeedItem[];
  connection: RunConnection;
}) {
  const newestFirst = [...items].reverse();

  return (
    <section aria-label="Agent activity" className="instrument-surface flex flex-col rounded-sm">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            connection === "live" ? "bg-ai motion-safe:animate-pulse" : "bg-muted-foreground/40",
          )}
        />
        <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Agents at work
        </h3>
      </header>
      {/* Scrollable, so it must be reachable by keyboard. Not a live region:
          the agents post far too often to announce. */}
      <ol tabIndex={0} className="max-h-72 space-y-2.5 overflow-y-auto px-4 py-3">
        {newestFirst.length === 0 ? (
          <li className="text-xs text-muted-foreground">Nothing yet — the room is quiet.</li>
        ) : (
          newestFirst.map((item) => (
            <li key={item.id} className="text-sm">
              <span className="font-medium text-ai">{AGENT_LABELS[item.agent]}</span>
              {item.chapterNumber !== undefined ? (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {" "}
                  · ch {item.chapterNumber}
                </span>
              ) : null}
              <span className="block text-muted-foreground">{item.message}</span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
