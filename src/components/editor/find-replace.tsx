"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, Replace, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      index = haystack.indexOf(needle, index + 1);
    }
  });
  return matches;
}

export function FindReplace({ editor, onClose }: { editor: Editor; onClose: () => void }) {
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
      className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2"
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
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => search(event.target.value)}
        placeholder="Find…"
        aria-label="Find"
        className="h-7 w-40 text-xs"
      />
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums" role="status">
        {query ? `${matches.length === 0 ? 0 : current + 1}/${matches.length}` : ""}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Previous match"
        disabled={matches.length === 0}
        onClick={() => step(-1)}
      >
        <ChevronUp aria-hidden="true" className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Next match"
        disabled={matches.length === 0}
        onClick={() => step(1)}
      >
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </Button>
      <Input
        value={replacement}
        onChange={(event) => setReplacement(event.target.value)}
        placeholder="Replace with…"
        aria-label="Replace with"
        className="h-7 w-40 text-xs"
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={matches.length === 0}
        onClick={replaceCurrent}
      >
        <Replace aria-hidden="true" className="size-3.5" />
        Replace
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={matches.length === 0}
        onClick={replaceAll}
      >
        Replace all
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto size-7"
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
