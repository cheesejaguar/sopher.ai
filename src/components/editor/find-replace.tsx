"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { BookOpen, ChevronDown, ChevronUp, Loader2, Replace, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyBookReplace,
  previewBookReplace,
  type BookReplaceEntityMatch,
} from "@/lib/actions/book-replace";
import {
  findMatchRanges,
  type ChapterReplacePreview,
  type MatchSnippet,
  type ReplaceOptions,
} from "@/lib/editor/replace-plan";
import { cn } from "@/lib/utils";

/**
 * Find & replace for one chapter or for the whole book.
 *
 * Chapter mode operates directly on the ProseMirror doc: matches are located by
 * walking text nodes (positions stay valid because every replace is a single
 * transaction and the list is recomputed after). Book mode hands the same
 * query to two server actions — deterministic, free, no model involved.
 *
 * The dangerous case is this editor's own unsaved state. A book-wide replace
 * rewrites the open chapter server-side, so the preview flushes autosave first
 * and records the version it saw; any later keystroke marks the preview stale
 * and the apply is blocked until it is refreshed. That is why the flow is two
 * steps and not one button.
 */

type Match = { from: number; to: number };

function findMatches(editor: Editor, query: string, options: ReplaceOptions): Match[] {
  if (!query) return [];
  const matches: Match[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    // Per text node, so a whole-word match at a node edge (mid-sentence bold,
    // say) sees the node boundary rather than the neighbouring character. Book
    // mode reads the markdown, where no such split exists.
    for (const range of findMatchRanges(node.text, query, options)) {
      matches.push({ from: pos + range.start, to: pos + range.end });
    }
  });
  return matches;
}

function Snippet({ snippet }: { snippet: MatchSnippet }) {
  return (
    <p className="truncate font-serif text-xs text-muted-foreground">
      {snippet.before}
      <mark className="rounded-xs bg-accent px-0.5 font-medium text-accent-foreground">
        {snippet.match}
      </mark>
      {snippet.after}
    </p>
  );
}

type BookPreview = {
  totalMatches: number;
  chapters: ChapterReplacePreview[];
  entities: BookReplaceEntityMatch[];
};

export function FindReplace({
  editor,
  onClose,
  touchLayout = false,
  projectId,
  chapterId,
  flushChapter,
  onCurrentChapterReplaced,
}: {
  editor: Editor;
  onClose: () => void;
  /** Stacks fields and enlarges controls inside the phone/tablet sheet. */
  touchLayout?: boolean;
  /** Enables book mode. Without it this stays the chapter-scoped bar. */
  projectId?: string;
  /** The chapter open here, so its new prose can come back inline. */
  chapterId?: string;
  /** Autosave flush; a book-wide replace only runs once it resolves true. */
  flushChapter?: () => Promise<boolean>;
  /** Adopt the server's rewrite of this chapter without a reload. */
  onCurrentChapterReplaced?: (chapter: {
    content: string;
    version: number;
    wordCount: number;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [bookOpen, setBookOpen] = useState(false);
  const [preview, setPreview] = useState<BookPreview | null>(null);
  const [chosenChapters, setChosenChapters] = useState<ReadonlySet<string>>(new Set());
  const [chosenEntities, setChosenEntities] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [stale, setStale] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const bookCapable = Boolean(projectId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const refresh = useCallback(
    (nextQuery: string, keepIndex = false) => {
      const found = findMatches(editor, nextQuery, { caseSensitive, wholeWord });
      setMatches(found);
      setCurrent((prev) => (keepIndex ? Math.min(prev, Math.max(found.length - 1, 0)) : 0));
      return found;
    },
    [editor, caseSensitive, wholeWord],
  );

  /**
   * A preview is only as good as the versions it recorded. Any edit here — a
   * keystroke, an accepted suggestion — invalidates it, and the author has to
   * refresh rather than write over prose the preview never saw.
   */
  useEffect(() => {
    if (!preview) return;
    const invalidate = () => setStale(true);
    editor.on("update", invalidate);
    return () => {
      editor.off("update", invalidate);
    };
  }, [editor, preview]);

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

  /** Toggling an option changes what counts as a match, so re-run the search. */
  function setOption(change: ReplaceOptions) {
    const next = { caseSensitive, wholeWord, ...change };
    setCaseSensitive(Boolean(next.caseSensitive));
    setWholeWord(Boolean(next.wholeWord));
    const found = findMatches(editor, query, next);
    setMatches(found);
    setCurrent(0);
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
    const all = [...findMatches(editor, query, { caseSensitive, wholeWord })].reverse();
    if (all.length === 0) return;
    let chain = editor.chain();
    for (const match of all) {
      chain = chain.insertContentAt(match, replacement);
    }
    chain.run();
    refresh(query);
  }

  function toggle(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  }

  const runPreview = useCallback(async () => {
    if (!projectId || !query) return;
    setBusy("preview");
    setProblem(null);
    setOutcome(null);
    try {
      // Flush before reading versions, never after: an autosave landing between
      // the preview and the apply is exactly what the version guard rejects.
      if (flushChapter && !(await flushChapter())) {
        setProblem(
          "This chapter could not be saved, so a book-wide replace would overwrite it. Resolve the save conflict first.",
        );
        setPreview(null);
        return;
      }
      const result = await previewBookReplace(projectId, {
        query,
        replacement,
        caseSensitive,
        wholeWord,
      });
      if (!result.ok) {
        setProblem(result.message);
        setPreview(null);
        return;
      }
      setPreview(result);
      setChosenChapters(new Set(result.chapters.map((chapter) => chapter.chapterId)));
      // Canon renames stay opt-in — the author decides whether the character in
      // the Story Bible is the same one the prose is talking about.
      setChosenEntities(new Set());
      setStale(false);
    } catch {
      setProblem("The preview could not be loaded. Check your connection and try again.");
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }, [caseSensitive, flushChapter, projectId, query, replacement, wholeWord]);

  const runApply = useCallback(async () => {
    if (!projectId || !preview) return;
    const chapters = preview.chapters
      .filter((chapter) => chosenChapters.has(chapter.chapterId))
      .map((chapter) => ({ chapterId: chapter.chapterId, version: chapter.version }));
    if (chapters.length === 0) return;

    setBusy("apply");
    setProblem(null);
    // Freeze typing for the round trip: a keystroke landing between the request
    // and the server's rewrite of this chapter would be discarded.
    editor.setEditable(false);
    try {
      const result = await applyBookReplace(projectId, {
        query,
        replacement,
        caseSensitive,
        wholeWord,
        chapters,
        entityIds: [...chosenEntities],
        currentChapterId: chapterId ?? null,
      });
      if (!result.ok) {
        setProblem(result.message);
        if (result.error === "conflict") setStale(true);
        return;
      }
      if (result.currentChapter) {
        if (onCurrentChapterReplaced) onCurrentChapterReplaced(result.currentChapter);
        else setProblem("This chapter was rewritten on the server — reload to see it.");
      }
      const renamed =
        result.entitiesRenamed > 0
          ? `, and renamed ${result.entitiesRenamed} Story Bible ${
              result.entitiesRenamed === 1 ? "entry" : "entries"
            }`
          : "";
      setOutcome(
        `Replaced ${result.replacements} ${
          result.replacements === 1 ? "occurrence" : "occurrences"
        } across ${result.chaptersChanged} ${
          result.chaptersChanged === 1 ? "chapter" : "chapters"
        }${renamed}.`,
      );
      setPreview(null);
      refresh(query);
    } catch {
      setProblem("The replace could not be completed. Nothing was changed — try again.");
    } finally {
      if (!editor.isDestroyed) editor.setEditable(true);
      setBusy(null);
    }
  }, [
    caseSensitive,
    chapterId,
    chosenChapters,
    chosenEntities,
    editor,
    onCurrentChapterReplaced,
    preview,
    projectId,
    query,
    refresh,
    replacement,
    wholeWord,
  ]);

  const chosenCount = preview
    ? preview.chapters.filter((chapter) => chosenChapters.has(chapter.chapterId)).length
    : 0;
  const optionButton = cn("size-7 font-mono text-[11px]", touchLayout && "size-11 rounded-sm");

  return (
    <div
      className={cn("bg-card", touchLayout && "bg-transparent")}
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
      <div
        role="search"
        aria-label="Find and replace"
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-border px-3 py-2",
          touchLayout && "flex-col items-stretch border-0 p-4",
        )}
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
        <div className={touchLayout ? "flex items-center gap-2" : "contents"}>
          <Button
            variant={caseSensitive ? "secondary" : "ghost"}
            size="icon"
            className={optionButton}
            aria-pressed={caseSensitive}
            aria-label="Match case"
            title="Match case"
            onClick={() => setOption({ caseSensitive: !caseSensitive })}
          >
            Aa
          </Button>
          <Button
            variant={wholeWord ? "secondary" : "ghost"}
            size="icon"
            className={optionButton}
            aria-pressed={wholeWord}
            aria-label="Whole word only"
            title="Whole word only"
            onClick={() => setOption({ wholeWord: !wholeWord })}
          >
            ab|
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
        {bookCapable ? (
          <Button
            variant={bookOpen ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-7 px-2 text-xs", touchLayout && "min-h-11 w-full text-sm")}
            aria-expanded={bookOpen}
            aria-controls="book-replace-panel"
            onClick={() => setBookOpen((prev) => !prev)}
          >
            <BookOpen aria-hidden="true" className="size-3.5" />
            Whole book
          </Button>
        ) : null}
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

      {bookCapable && bookOpen ? (
        <section
          id="book-replace-panel"
          aria-label="Replace across the whole book"
          className={cn(
            "max-h-80 space-y-3 overflow-y-auto border-b border-border px-3 py-3",
            touchLayout && "max-h-none border-0 px-4",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className={cn("h-8 text-xs", touchLayout && "min-h-11 text-sm")}
              disabled={!query || busy !== null}
              onClick={() => void runPreview()}
            >
              {busy === "preview" ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : null}
              {preview ? "Refresh preview" : "Preview across book"}
            </Button>
            {preview ? (
              <Button
                size="sm"
                className={cn("h-8 text-xs", touchLayout && "min-h-11 text-sm")}
                disabled={busy !== null || stale || chosenCount === 0}
                onClick={() => void runApply()}
              >
                {busy === "apply" ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : null}
                Replace in {chosenCount} {chosenCount === 1 ? "chapter" : "chapters"}
              </Button>
            ) : null}
            <p className="text-[11px] text-muted-foreground">Free — no credits used.</p>
          </div>

          {stale && preview ? (
            <p className="flex items-start gap-2 rounded-sm border border-ember/40 bg-ember/10 px-2 py-1.5 text-xs text-foreground">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ember" />
              This chapter changed since the preview. Refresh it before replacing, so nothing you
              just wrote is overwritten.
            </p>
          ) : null}

          {problem ? (
            <p className="flex items-start gap-2 rounded-sm border border-ember/40 bg-ember/10 px-2 py-1.5 text-xs text-foreground">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ember" />
              {problem}
            </p>
          ) : null}

          {preview ? (
            preview.chapters.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No chapter in this book contains “{query}”.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {preview.totalMatches} {preview.totalMatches === 1 ? "match" : "matches"} in{" "}
                  {preview.chapters.length} {preview.chapters.length === 1 ? "chapter" : "chapters"}
                  . Every chapter is snapshotted before it changes, so this is undoable from Chapter
                  history.
                </p>
                <ul className="space-y-1.5">
                  {preview.chapters.map((chapter) => (
                    <li key={chapter.chapterId}>
                      <label className="flex min-h-11 items-start gap-3 rounded-sm border border-border px-2 py-2 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 accent-primary"
                          checked={chosenChapters.has(chapter.chapterId)}
                          onChange={() =>
                            setChosenChapters((prev) => toggle(prev, chapter.chapterId))
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">
                              Chapter {chapter.chapterNumber}
                              {chapter.title ? ` — ${chapter.title}` : ""}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                              {chapter.matchCount}
                            </span>
                          </span>
                          {chapter.snippets.map((snippet, index) => (
                            <Snippet key={index} snippet={snippet} />
                          ))}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : null}

          {preview && preview.entities.length > 0 ? (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium">Story Bible</h3>
              <p className="text-xs text-muted-foreground">
                Rename the canon too, so the bible and the prose keep saying the same thing.
              </p>
              <ul className="space-y-1.5">
                {preview.entities.map((entity) => (
                  <li key={entity.entityId}>
                    <label className="flex min-h-11 items-start gap-3 rounded-sm border border-border px-2 py-2 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                        checked={chosenEntities.has(entity.entityId)}
                        onChange={() => setChosenEntities((prev) => toggle(prev, entity.entityId))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{entity.name}</span>
                        {replacement && entity.nextName !== entity.name ? (
                          <span className="text-muted-foreground"> → {entity.nextName}</span>
                        ) : null}
                        <span className="block text-[11px] text-muted-foreground">
                          {entity.kind}
                          {entity.matchingAliases.length > 0
                            ? ` · aliases: ${entity.matchingAliases.join(", ")}`
                            : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Outcomes only, announced once the work finishes. */}
          <p role="status" aria-live="polite" className={outcome ? "text-xs" : "sr-only"}>
            {outcome}
          </p>
        </section>
      ) : null}
    </div>
  );
}
