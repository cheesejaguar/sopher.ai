"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BookOpenCheck, Check, ScanText, SlidersHorizontal, Unlink, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useStudioSuspension } from "@/components/studio/studio-access-context";
import type { SuggestionDTO } from "@/lib/editor/types";

import { severityLabels, suggestionTypeLabel } from "./suggestion-card";

const severityRank: Record<SuggestionDTO["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const severityDotClasses: Record<SuggestionDTO["severity"], string> = {
  info: "bg-ai",
  warning: "bg-ember",
  error: "bg-destructive",
};

const GROUP_ORDER = ["structure", "continuity", "line", "style", "selection"];

function groupSuggestions(suggestions: SuggestionDTO[]): [string, SuggestionDTO[]][] {
  const groups = new Map<string, SuggestionDTO[]>();
  for (const s of suggestions) {
    const list = groups.get(s.suggestionType) ?? [];
    list.push(s);
    groups.set(s.suggestionType, list);
  }
  for (const list of groups.values()) {
    list.sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] || a.anchor.start - b.anchor.start,
    );
  }
  return [...groups.entries()].sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a[0]) +
      100 * Number(GROUP_ORDER.indexOf(a[0]) === -1) -
      (GROUP_ORDER.indexOf(b[0]) + 100 * Number(GROUP_ORDER.indexOf(b[0]) === -1)),
  );
}

/**
 * Placeholder while a review runs. Not a live region: the region is created at
 * the same moment as its content so nothing would be announced anyway — the
 * editor shell owns the polite announcement for review start and completion.
 */
function ReviewingState({ chapterNumber }: { chapterNumber: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true">
      <p className="flex items-center gap-2 text-xs text-ai">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ai" />
        The editor is reading chapter {chapterNumber}…
      </p>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="space-y-2 rounded-lg border border-ai/20 bg-ai-soft/20 p-3"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  unanchored,
  active,
  busy,
  onSelect,
  onHover,
  onAccept,
  onReject,
  touchFriendly,
}: {
  suggestion: SuggestionDTO;
  unanchored: boolean;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
  onAccept: () => void;
  onReject: () => void;
  touchFriendly: boolean;
}) {
  return (
    <li
      className={cn(
        "group rounded-lg border border-border bg-card p-2.5 transition-colors",
        active && "border-ai/60 bg-ai-soft/20",
        unanchored && "opacity-70",
      )}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      // Focus events bubble, so keyboard users get the same in-text highlight
      // that hovering the row gives mouse users.
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "block w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          touchFriendly && "min-h-11",
        )}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              severityDotClasses[suggestion.severity],
            )}
          >
            <span className="sr-only">{severityLabels[suggestion.severity]}.</span>
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {suggestionTypeLabel(suggestion.suggestionType)}
          </span>
          {unanchored ? (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
              <Unlink aria-hidden="true" className="size-3" /> unanchored
            </span>
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 block font-serif text-xs leading-relaxed">
          <del className="text-muted-foreground line-through decoration-destructive/40">
            {suggestion.anchor.originalText}
          </del>{" "}
          <ins className="text-ai no-underline">{suggestion.suggestedText}</ins>
        </span>
        <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground">
          {suggestion.explanation}
        </span>
      </button>
      <div
        className={cn(
          "mt-1.5 flex gap-1 transition-opacity",
          touchFriendly
            ? "opacity-100"
            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        <Button
          variant="ghost"
          size="xs"
          className={cn(touchFriendly && "min-h-11 flex-1")}
          disabled={busy}
          onClick={onAccept}
        >
          <Check aria-hidden="true" className="text-success" /> Accept
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className={cn(touchFriendly && "min-h-11 flex-1")}
          disabled={busy}
          onClick={onReject}
        >
          <X aria-hidden="true" /> Reject
        </Button>
      </div>
    </li>
  );
}

/**
 * The right-hand suggestions panel: run a whole-chapter review, browse
 * grouped suggestions, and resolve them one-by-one or in bulk.
 */
export function ReviewPanel({
  chapterNumber,
  suggestions,
  unanchored,
  activeId,
  reviewing,
  busy,
  onReview,
  onSelect,
  onHover,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  touchFriendly = false,
}: {
  chapterNumber: number;
  suggestions: SuggestionDTO[];
  unanchored: Set<string>;
  activeId: string | null;
  reviewing: boolean;
  busy: boolean;
  onReview: (instruction?: string) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  /** Keeps actions visible and at least 44px inside touch-oriented sheets. */
  touchFriendly?: boolean;
}) {
  const suspended = useStudioSuspension();
  const [instruction, setInstruction] = useState("");
  const [focusOpen, setFocusOpen] = useState(false);
  const count = suggestions.length;
  const focusLabelId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  // Resolving a suggestion unmounts the row its button lived on. Catch the
  // dropped focus and park it on the list so keyboard users keep their place.
  useEffect(() => {
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    // A frame late, so a closing dialog gets first refusal on the focus.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && document.body.contains(active)) return;
      listRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [suggestions]);

  function resolving(action: () => void) {
    restoreFocusRef.current = true;
    action();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex items-center gap-1.5 border-b border-border p-3",
          touchFriendly && "flex-wrap pr-14",
        )}
      >
        <h2 className="text-sm font-semibold">Suggestions</h2>
        {count > 0 ? (
          <span className="rounded-full bg-ai-soft px-1.5 font-mono text-[10px] text-ai tabular-nums">
            {count}
            <span className="sr-only"> pending</span>
          </span>
        ) : null}
        <div className={cn("ml-auto flex items-center gap-1", touchFriendly && "mt-1 w-full")}>
          <Popover open={focusOpen} onOpenChange={setFocusOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  // The tinted icon is the only visual cue that a focus is
                  // set; carry that state in the name too.
                  aria-label={
                    suspended
                      ? "Review focus unavailable while account is suspended"
                      : instruction
                        ? "Review focus set — change it"
                        : "Set a focus for the review"
                  }
                  disabled={suspended}
                  className={cn(touchFriendly && "size-11 rounded-sm", instruction && "text-ai")}
                />
              }
            >
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <p id={focusLabelId} className="mb-2 text-xs font-medium">
                Focus this review (optional)
              </p>
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. dialogue rhythm, pacing in the middle"
                className={cn("h-8 text-xs", touchFriendly && "h-11 text-sm")}
                aria-labelledby={focusLabelId}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setFocusOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className={cn(touchFriendly && "min-h-11 flex-1 rounded-sm")}
            disabled={reviewing || busy || suspended}
            onClick={() => onReview(instruction.trim() || undefined)}
          >
            <BookOpenCheck aria-hidden="true" className="text-ai" />
            Review chapter
          </Button>
        </div>
      </div>

      {suspended ? (
        <p className="border-b border-destructive/30 px-3 py-2 text-xs text-muted-foreground">
          New AI reviews are unavailable while this account is suspended. Existing suggestions can
          still be accepted, edited, or dismissed.
        </p>
      ) : null}

      <div
        ref={listRef}
        role="group"
        tabIndex={-1}
        aria-label="Suggestion list"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {reviewing ? (
          <ReviewingState chapterNumber={chapterNumber} />
        ) : count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <ScanText aria-hidden="true" className="size-5 text-ai/60" />
            <p className="text-sm font-medium">No suggestions yet</p>
            <p className="max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
              Run a review, or select a passage on the page and ask for a rewrite.
            </p>
          </div>
        ) : (
          <div className="space-y-4 p-3">
            {groupSuggestions(suggestions).map(([type, items]) => (
              <section key={type} aria-label={suggestionTypeLabel(type)}>
                <h3 className="mb-1.5 px-0.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                  {suggestionTypeLabel(type)} · {items.length}
                </h3>
                <ul className="space-y-2">
                  {items.map((s) => (
                    <SuggestionRow
                      key={s.id}
                      suggestion={s}
                      unanchored={unanchored.has(s.id)}
                      active={s.id === activeId}
                      busy={busy}
                      onSelect={() => onSelect(s.id)}
                      onHover={(h) => onHover(h ? s.id : null)}
                      onAccept={() => resolving(() => onAccept(s.id))}
                      onReject={() => resolving(() => onReject(s.id))}
                      touchFriendly={touchFriendly}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {count > 0 && !reviewing ? (
        <div className="flex gap-1.5 border-t border-border p-3">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  size="sm"
                  className={cn("flex-1", touchFriendly && "min-h-11 rounded-sm")}
                  disabled={busy}
                />
              }
            >
              Accept all
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Accept all {count} suggestions?</AlertDialogTitle>
                <AlertDialogDescription>
                  Each suggestion is applied in order. Any whose passage has since changed are
                  skipped and reported.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className={cn(touchFriendly && "min-h-11 rounded-sm")}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className={cn(touchFriendly && "min-h-11 rounded-sm")}
                  onClick={() => resolving(onAcceptAll)}
                >
                  Accept {count} suggestion{count === 1 ? "" : "s"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("flex-1", touchFriendly && "min-h-11 rounded-sm")}
                  disabled={busy}
                />
              }
            >
              Reject all
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Reject all {count} suggestions?</AlertDialogTitle>
                <AlertDialogDescription>
                  The manuscript stays untouched; the suggestions are dismissed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className={cn(touchFriendly && "min-h-11 rounded-sm")}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className={cn(touchFriendly && "min-h-11 rounded-sm")}
                  onClick={() => resolving(onRejectAll)}
                >
                  Reject {count} suggestion{count === 1 ? "" : "s"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  );
}
