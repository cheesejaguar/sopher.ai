"use client";

import { useState } from "react";
import { BookOpenCheck, Check, SlidersHorizontal, Sparkles, Unlink, X } from "lucide-react";

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
import type { SuggestionDTO } from "@/lib/editor/types";

import { suggestionTypeLabel } from "./suggestion-card";

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

function ReviewingState({ chapterNumber }: { chapterNumber: number }) {
  return (
    <div className="space-y-3 p-4" aria-live="polite">
      <p className="flex items-center gap-2 text-xs text-ai">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-ai motion-safe:animate-pulse"
        />
        The editor is reading chapter {chapterNumber}…
      </p>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-ai/20 bg-ai-soft/20 p-3">
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
}: {
  suggestion: SuggestionDTO;
  unanchored: boolean;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
  onAccept: () => void;
  onReject: () => void;
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
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              severityDotClasses[suggestion.severity],
            )}
          />
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
          <span className="text-muted-foreground line-through decoration-destructive/40">
            {suggestion.anchor.originalText}
          </span>{" "}
          <span className="text-ai">{suggestion.suggestedText}</span>
        </span>
        <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground">
          {suggestion.explanation}
        </span>
      </button>
      <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button variant="ghost" size="xs" disabled={busy} onClick={onAccept}>
          <Check aria-hidden="true" className="text-success" /> Accept
        </Button>
        <Button variant="ghost" size="xs" disabled={busy} onClick={onReject}>
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
}) {
  const [instruction, setInstruction] = useState("");
  const [focusOpen, setFocusOpen] = useState(false);
  const count = suggestions.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border p-3">
        <h2 className="text-sm font-semibold">Suggestions</h2>
        {count > 0 ? (
          <span className="rounded-full bg-ai-soft px-1.5 font-mono text-[10px] text-ai tabular-nums">
            {count}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Popover open={focusOpen} onOpenChange={setFocusOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Set a focus for the review"
                  className={cn(instruction && "text-ai")}
                />
              }
            >
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <p className="mb-2 text-xs font-medium">Focus this review (optional)</p>
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. dialogue rhythm, pacing in the middle"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") setFocusOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            disabled={reviewing || busy}
            onClick={() => onReview(instruction.trim() || undefined)}
          >
            <BookOpenCheck aria-hidden="true" className="text-ai" />
            Review chapter
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {reviewing ? (
          <ReviewingState chapterNumber={chapterNumber} />
        ) : count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Sparkles aria-hidden="true" className="size-5 text-ai/60" />
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
                      onAccept={() => onAccept(s.id)}
                      onReject={() => onReject(s.id)}
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
            <AlertDialogTrigger render={<Button size="sm" className="flex-1" disabled={busy} />}>
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
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onAcceptAll}>
                  Accept {count} suggestion{count === 1 ? "" : "s"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="ghost" size="sm" className="flex-1" disabled={busy} />}
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
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRejectAll}>
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
