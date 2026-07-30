"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, Replace, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Chapter-scoped find & replace, operating directly on the ProseMirror doc.
 *
 * Matches are located by walking text nodes (positions stay valid because
 * every replace is a single transaction and the list is recomputed after).
 * Case-insensitive, plain text — writers search for phrases, not regexes.
 */

type Match = { from: number; to: number };

function findMatches(editor: Editor, query: string): Match[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const matches: Match[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const haystack = node.text.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + query.length });
      // Non-overlapping, like every editor: the next search starts after the
      // match, which is also what keeps replace-all ranges disjoint.
      index = haystack.indexOf(needle, index + query.length);
    }
  });
  return matches;
}

export function FindReplace({
  editor,
  onClose,
  touchLayout = false,
}: {
  editor: Editor;
  onClose: () => void;
  /** Stacks fields and enlarges controls inside the phone/tablet sheet. */
  touchLayout?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const refresh = useCallback(
    (nextQuery: string, keepIndex = false) => {
      const found = findMatches(editor, nextQuery);
      setMatches(found);
      setCurrent((prev) => (keepIndex ? Math.min(prev, Math.max(found.length - 1, 0)) : 0));
      return found;
    },
    [editor],
  );

  const jumpTo = useCallback(
    (match: Match | undefined) => {
      if (!match) return;
      editor.chain().setTextSelection(match).scrollIntoView().run();
    },
    [editor],
  );

  function search(next: string) {
    setQuery(next);
    const found = refresh(next);
    jumpTo(found[0]);
  }

  function step(direction: 1 | -1) {
    if (matches.length === 0) return;
    const next = (current + direction + matches.length) % matches.length;
    setCurrent(next);
    jumpTo(matches[next]);
  }

  function replaceCurrent() {
    const match = matches[current];
    if (!match) return;
    editor.chain().insertContentAt(match, replacement).run();
    const found = refresh(query, true);
    jumpTo(found[Math.min(current, found.length - 1)]);
  }

  function replaceAll() {
    // Back to front, so earlier positions stay valid within one pass.
    const all = [...findMatches(editor, query)].reverse();
    if (all.length === 0) return;
    let chain = editor.chain();
    for (const match of all) {
      chain = chain.insertContentAt(match, replacement);
    }
    chain.run();
    refresh(query);
  }

  return (
    <div
      role="search"
      aria-label="Find and replace in this chapter"
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2",
        touchLayout && "flex-col items-stretch border-0 bg-transparent p-4",
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
          editor.commands.focus();
        }
        if (event.key === "Enter" && event.target === inputRef.current) {
          event.preventDefault();
          step(event.shiftKey ? -1 : 1);
        }
      }}
    >
      <div className={touchLayout ? "flex items-center gap-2" : "contents"}>
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => search(event.target.value)}
          placeholder="Find…"
          aria-label="Find"
          className={cn("h-7 w-40 text-xs", touchLayout && "h-11 min-w-0 flex-1 text-base")}
        />
        <span
          className={cn(
            "font-mono text-[11px] text-muted-foreground tabular-nums",
            touchLayout && "w-10 shrink-0 text-center",
          )}
          role="status"
          aria-label={
            query
              ? matches.length === 0
                ? "No matches"
                : `Match ${current + 1} of ${matches.length}`
              : undefined
          }
        >
          {query ? `${matches.length === 0 ? 0 : current + 1}/${matches.length}` : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7", touchLayout && "size-11 rounded-sm")}
          aria-label="Previous match"
          disabled={matches.length === 0}
          onClick={() => step(-1)}
        >
          <ChevronUp aria-hidden="true" className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7", touchLayout && "size-11 rounded-sm")}
          aria-label="Next match"
          disabled={matches.length === 0}
          onClick={() => step(1)}
        >
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
      <Input
        value={replacement}
        onChange={(event) => setReplacement(event.target.value)}
        placeholder="Replace with…"
        aria-label="Replace with"
        className={cn("h-7 w-40 text-xs", touchLayout && "h-11 w-full text-base")}
      />
      <div className={touchLayout ? "grid grid-cols-2 gap-2" : "contents"}>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 px-2 text-xs", touchLayout && "min-h-11 text-sm")}
          disabled={matches.length === 0}
          onClick={replaceCurrent}
        >
          <Replace aria-hidden="true" className="size-3.5" />
          Replace
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 px-2 text-xs", touchLayout && "min-h-11 text-sm")}
          disabled={matches.length === 0}
          onClick={replaceAll}
        >
          Replace all
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={cn("ml-auto size-7", touchLayout && "hidden")}
        aria-label="Close find and replace"
        onClick={() => {
          onClose();
          editor.commands.focus();
        }}
      >
        <X aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}
