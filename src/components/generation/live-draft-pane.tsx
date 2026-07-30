"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChapterProgress } from "@/hooks/use-run-stream";
import type { Stage } from "@/lib/run-events";

export function visibleDraftTabs(
  started: number[],
  selected: number | undefined,
  limit = 6,
): number[] {
  const safeLimit = Math.max(1, limit);
  const recent = started.slice(-safeLimit);
  if (selected === undefined || !started.includes(selected) || recent.includes(selected)) {
    return recent;
  }
  return safeLimit === 1
    ? [selected]
    : [selected, ...recent.slice(-(safeLimit - 1))].sort((a, b) => a - b);
}

/**
 * The paper pane where drafting chapters stream in. One tab per chapter that
 * has started drafting this session; finished chapters keep their tab (and
 * text) until the wave scrolls past.
 */
export function LiveDraftPane({
  chapters,
  titles,
  stage,
  subscribeChapterProse,
}: {
  chapters: Map<number, ChapterProgress>;
  titles: Record<number, string | null>;
  stage: Stage;
  subscribeChapterProse: (chapterNumber: number, onText: (fullText: string) => void) => () => void;
}) {
  const [selected, setSelected] = React.useState<string | undefined>(undefined);
  const [focusPinned, setFocusPinned] = React.useState<string | undefined>(undefined);
  // Tabs are fully derived from chapter events: every chapter that has begun
  // drafting (or finished) gets one, capped to six. Keep the reader's selected
  // tab mounted when newer chapters arrive so its trigger, panel, and keyboard
  // focus do not disappear underneath them.
  const { openTabs, drafting } = React.useMemo(() => {
    const started = [...chapters.entries()]
      .filter(([, ch]) => ch.status !== "planned")
      .map(([n]) => n)
      .sort((a, b) => a - b);
    const retainedTab = focusPinned ?? selected;
    const retainedNumber = retainedTab === undefined ? undefined : Number(retainedTab);
    const openTabs = visibleDraftTabs(started, retainedNumber);
    return {
      openTabs,
      drafting: openTabs.filter((n) => chapters.get(n)?.status === "drafting"),
    };
  }, [chapters, focusPinned, selected]);

  // The reader's explicit choice wins while it's still a valid tab; otherwise
  // follow the earliest chapter currently drafting.
  const active =
    selected !== undefined && openTabs.includes(Number(selected))
      ? selected
      : drafting[0] !== undefined
        ? String(drafting[0])
        : openTabs[0] !== undefined
          ? String(openTabs[0])
          : undefined;

  if (openTabs.length === 0) {
    return (
      <div className="manuscript-sheet flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p className="font-serif text-lg text-paper-muted">
          {stage === "queued" || stage === "concept" || stage === "outline" || stage === "bible"
            ? "The writers take over once the outline is set."
            : stage === "awaiting_approval"
              ? "Drafting begins after you approve the outline."
              : "Waiting for the next chapter to begin."}
        </p>
        <p className="max-w-sm font-sans text-xs text-paper-muted">
          Chapter drafts arrive word by word, several chapters at a time. Everything you see here is
          saved as it lands.
        </p>
      </div>
    );
  }

  return (
    <Tabs
      value={active}
      onValueChange={(value) => setSelected(String(value))}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setFocusPinned(undefined);
        }
      }}
    >
      <TabsList aria-label="Drafting chapters" className="max-w-full overflow-x-auto">
        {openTabs.map((n) => {
          const status = chapters.get(n)?.status;
          const live = status === "drafting";
          return (
            <TabsTrigger key={n} value={String(n)} onFocus={() => setFocusPinned(String(n))}>
              {live ? (
                <span
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="size-1.5 rounded-full bg-ai motion-safe:animate-pulse"
                />
              ) : null}
              Chapter {n}
              {live ? <span className="sr-only"> (drafting now)</span> : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {openTabs.map((n) => (
        <TabsContent key={n} value={String(n)} onFocusCapture={() => setFocusPinned(String(n))}>
          <ChapterProseView
            chapterNumber={n}
            title={titles[n] ?? null}
            progress={chapters.get(n)}
            subscribeChapterProse={subscribeChapterProse}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

const FOLLOW_THRESHOLD_PX = 56;

function ChapterProseView({
  chapterNumber,
  title,
  progress,
  subscribeChapterProse,
}: {
  chapterNumber: number;
  title: string | null;
  progress?: ChapterProgress;
  subscribeChapterProse: (chapterNumber: number, onText: (fullText: string) => void) => () => void;
}) {
  const [text, setText] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const followRef = React.useRef(true);
  const [showJump, setShowJump] = React.useState(false);
  const live = progress?.status === "drafting";

  // Each subscription replays the chapter's prose from the start and reports
  // the full accumulated text, so re-subscribing safely replaces local state.
  React.useEffect(
    () => subscribeChapterProse(chapterNumber, setText),
    [chapterNumber, subscribeChapterProse],
  );

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && followRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [text]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX;
    followRef.current = atBottom;
    setShowJump(!atBottom && live);
  }

  function jumpToLive() {
    const el = scrollRef.current;
    if (!el) return;
    followRef.current = true;
    setShowJump(false);
    el.focus({ preventScroll: true });
    el.scrollTop = el.scrollHeight;
  }

  const paragraphs = text.length > 0 ? text.split(/\n{2,}/) : [];

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // A scrollable box must be reachable by keyboard, and a bare <div>
        // cannot carry an accessible name — hence role="region" + tabIndex.
        // Deliberately NOT a live region: prose arrives token by token.
        role="region"
        tabIndex={0}
        aria-label={`Chapter ${chapterNumber} draft`}
        className="manuscript-sheet max-h-[32rem] min-h-72 overflow-y-auto px-6 py-8 sm:px-10"
      >
        <p className="font-sans text-xs tracking-widest text-paper-muted uppercase">
          Chapter {chapterNumber}
          {title ? ` · ${title}` : ""}
        </p>
        <div className="prose-manuscript mt-5">
          {paragraphs.length === 0 ? (
            <p className={cn("text-paper-muted", live && "stream-caret")}>
              {live
                ? "The writer is opening the chapter"
                : "No prose has streamed for this chapter yet."}
            </p>
          ) : (
            paragraphs.map((paragraph, index) => {
              const last = index === paragraphs.length - 1;
              return (
                <p key={index}>
                  {last && live ? <span className="stream-caret">{paragraph}</span> : paragraph}
                </p>
              );
            })
          )}
        </div>
        {!live && progress?.wordCount ? (
          <p className="mt-6 font-mono text-xs text-paper-muted tabular-nums">
            {new Intl.NumberFormat("en-US").format(progress.wordCount)} words ·{" "}
            {progress.status === "drafted" ? "draft complete" : progress.status}
          </p>
        ) : null}
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={jumpToLive}
          className="absolute bottom-4 left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-ai px-3 text-xs font-medium text-ai-foreground shadow-md transition-colors hover:bg-ai/90"
        >
          <ArrowDown aria-hidden="true" className="size-3.5" />
          Jump to live
        </button>
      ) : null}
    </div>
  );
}
