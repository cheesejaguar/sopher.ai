"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { searchManuscript, type ManuscriptSearchHit } from "@/lib/actions/manuscript-search";
import { cn } from "@/lib/utils";

/**
 * Manuscript-wide search. Free and read-only — Postgres full text does the
 * ranking and returns the excerpt already centred on the hit, so there is
 * nothing to meter and nothing to wait on but one query.
 *
 * The excerpt arrives as segments rather than markup: prose routinely contains
 * angle brackets and markdown, and none of it should ever be interpreted.
 */

const DEBOUNCE_MS = 250;
const MIN_QUERY_CHARS = 2;

function Excerpt({ hit }: { hit: ManuscriptSearchHit }) {
  return (
    <p className="mt-1 font-serif text-xs leading-relaxed text-muted-foreground">
      {hit.excerpt.map((segment, index) =>
        segment.highlight ? (
          <mark
            key={index}
            className="rounded-xs bg-accent px-0.5 font-medium text-accent-foreground"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export function ManuscriptSearch({
  projectId,
  onNavigate,
  touchFriendly = false,
  className,
}: {
  projectId: string;
  /** Lets a host sheet close itself when a result is opened. */
  onNavigate?: () => void;
  touchFriendly?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ManuscriptSearchHit[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Responses can arrive out of order; only the newest request may paint.
  const requestRef = useRef(0);

  const run = useCallback(
    async (text: string) => {
      const request = (requestRef.current += 1);
      setSearching(true);
      try {
        const result = await searchManuscript(projectId, { query: text });
        if (request !== requestRef.current) return;
        if (!result.ok) {
          setProblem(result.message);
          setHits([]);
          return;
        }
        setProblem(null);
        setHits(result.hits);
        setTruncated(result.truncated);
      } catch {
        if (request !== requestRef.current) return;
        setProblem("The search could not run. Check your connection and try again.");
        setHits([]);
      } finally {
        if (request === requestRef.current) setSearching(false);
      }
    },
    [projectId],
  );

  // The effect only schedules; clearing back to the empty state belongs with
  // the keystroke that caused it.
  function changeQuery(text: string) {
    setQuery(text);
    if (text.trim().length >= MIN_QUERY_CHARS) return;
    requestRef.current += 1;
    setHits(null);
    setProblem(null);
    setSearching(false);
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_CHARS) return;
    const timer = setTimeout(() => void run(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  return (
    <div
      role="search"
      aria-label="Search the manuscript"
      className={cn("flex flex-col", className)}
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="Search every chapter…"
          aria-label="Search every chapter"
          aria-describedby="manuscript-search-status"
          className={cn("h-9 pl-8 text-sm", touchFriendly && "h-11 text-base")}
        />
        {searching ? (
          <Loader2
            aria-hidden="true"
            className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>

      <p
        id="manuscript-search-status"
        role="status"
        aria-live="polite"
        className="mt-2 text-xs text-muted-foreground"
      >
        {problem
          ? problem
          : hits === null
            ? "Quoted phrases, or or, and a leading minus to exclude a word all work."
            : hits.length === 0
              ? `No chapter contains “${query.trim()}”.`
              : `${hits.length}${truncated ? "+" : ""} ${
                  hits.length === 1 ? "chapter" : "chapters"
                } match, best first.`}
      </p>

      {hits && hits.length > 0 ? (
        <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {hits.map((hit) => (
            <li key={hit.chapterId}>
              <Link
                href={`/projects/${projectId}/editor/${hit.chapterNumber}`}
                onClick={onNavigate}
                className={cn(
                  "block rounded-sm border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  touchFriendly && "min-h-11",
                )}
              >
                <span className="text-xs font-medium">
                  Chapter {hit.chapterNumber}
                  {hit.title ? ` — ${hit.title}` : ""}
                </span>
                <Excerpt hit={hit} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
