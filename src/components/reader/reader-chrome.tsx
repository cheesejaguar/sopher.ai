"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpenText, Check, ChevronDown, Download, Minus, Moon, Plus, Sun } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReaderTheme = "paper" | "night" | "sepia";

const THEMES: Array<{ id: ReaderTheme; label: string }> = [
  { id: "paper", label: "Paper theme" },
  { id: "sepia", label: "Warm theme" },
  { id: "night", label: "Night theme" },
];

const FONT_SCALES = [0.9, 1, 1.15, 1.3] as const;

export function ReaderChrome({
  title,
  readerBasePath,
  allowDownload,
  chapters,
  children,
}: {
  title: string;
  readerBasePath: string;
  allowDownload: boolean;
  chapters: Array<{ number: number; title: string }>;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = React.useState<ReaderTheme>("paper");
  const [fontIndex, setFontIndex] = React.useState(1);
  const [progress, setProgress] = React.useState(0);
  const contentsRef = React.useRef<HTMLDetailsElement>(null);
  const contentsSummaryRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = document.documentElement;
      const available = Math.max(1, root.scrollHeight - window.innerHeight);
      setProgress(Math.min(100, Math.max(0, (window.scrollY / available) * 100)));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  function chooseTheme(next: ReaderTheme) {
    setTheme(next);
  }

  function chooseFont(next: number) {
    const value = Math.min(FONT_SCALES.length - 1, Math.max(0, next));
    setFontIndex(value);
  }

  function closeContents({ restoreFocus = false } = {}) {
    if (contentsRef.current) contentsRef.current.open = false;
    if (restoreFocus) contentsSummaryRef.current?.focus();
  }

  return (
    <div
      className="reader-edition min-h-dvh"
      data-reader-theme={theme}
      style={{ "--reader-font-scale": FONT_SCALES[fontIndex] } as React.CSSProperties}
    >
      <div
        aria-hidden="true"
        className="reader-progress fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-primary"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
      <header className="reader-toolbar safe-area-top sticky top-0 z-50 border-b px-3 py-2 sm:px-5">
        <div className="mx-auto flex min-h-11 max-w-6xl min-w-0 items-center gap-2">
          <Link
            href="/"
            aria-label="sopher.ai home"
            className="grid size-11 shrink-0 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <BookOpenText aria-hidden="true" className="size-5" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>
            {title}
          </p>

          <details
            ref={contentsRef}
            className="reader-contents relative"
            onKeyDown={(event) => {
              if (event.key === "Escape" && event.currentTarget.open) {
                event.preventDefault();
                closeContents({ restoreFocus: true });
              }
            }}
          >
            <summary
              ref={contentsSummaryRef}
              className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-3 text-sm font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:hover:bg-white/5 [&::-webkit-details-marker]:hidden"
            >
              Contents
              <ChevronDown aria-hidden="true" className="size-4" />
            </summary>
            <nav
              aria-label="Reader contents"
              className="reader-menu fixed inset-x-3 top-[calc(env(safe-area-inset-top)+6.5rem)] max-h-[min(70dvh,34rem)] overflow-y-auto border p-2 shadow-2xl sm:absolute sm:inset-x-auto sm:top-[calc(100%+0.5rem)] sm:right-0 sm:w-[min(20rem,calc(100vw-1.5rem))]"
            >
              <a className="reader-menu-link" href="#title-page" onClick={() => closeContents()}>
                Title page
              </a>
              {chapters.map((chapter) => (
                <a
                  key={chapter.number}
                  className="reader-menu-link"
                  href={`#chapter-${chapter.number}`}
                  onClick={() => closeContents()}
                >
                  <span className="font-mono text-[0.6875rem] text-current/60">
                    {String(chapter.number).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 break-words">{chapter.title}</span>
                </a>
              ))}
            </nav>
          </details>

          <div className="hidden items-center sm:flex" role="group" aria-label="Reading size">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Make text smaller"
              disabled={fontIndex === 0}
              onClick={() => chooseFont(fontIndex - 1)}
            >
              <Minus aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Make text larger"
              disabled={fontIndex === FONT_SCALES.length - 1}
              onClick={() => chooseFont(fontIndex + 1)}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>

          <div
            className="reader-theme-switch hidden items-center gap-0.5 border p-0.5 md:flex"
            role="group"
            aria-label="Reader theme"
          >
            {THEMES.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-label={candidate.label}
                aria-pressed={theme === candidate.id}
                onClick={() => chooseTheme(candidate.id)}
                className={cn(
                  "grid size-9 place-items-center rounded-[1px] focus-visible:outline-2 focus-visible:outline-ring",
                  theme === candidate.id && "bg-current/10",
                )}
              >
                {candidate.id === "night" ? (
                  <Moon aria-hidden="true" className="size-4" />
                ) : candidate.id === "paper" ? (
                  <Sun aria-hidden="true" className="size-4" />
                ) : (
                  <Check aria-hidden="true" className="size-4" />
                )}
              </button>
            ))}
          </div>

          {allowDownload ? (
            <a
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              aria-label="Download this reader edition as Markdown"
              href={`${readerBasePath}/download`}
            >
              <Download aria-hidden="true" />
            </a>
          ) : null}
        </div>

        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 pb-1 sm:hidden">
          <div className="flex items-center" role="group" aria-label="Reading size">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={fontIndex === 0}
              onClick={() => chooseFont(fontIndex - 1)}
            >
              <Minus aria-hidden="true" />
              Smaller
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={fontIndex === FONT_SCALES.length - 1}
              onClick={() => chooseFont(fontIndex + 1)}
            >
              <Plus aria-hidden="true" />
              Larger
            </Button>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-sm px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              const index = THEMES.findIndex((candidate) => candidate.id === theme);
              chooseTheme(THEMES[(index + 1) % THEMES.length].id);
            }}
          >
            {THEMES.find((candidate) => candidate.id === theme)?.label}
          </button>
        </div>
      </header>

      {children}

      <footer className="reader-footer px-4 py-10 text-center text-xs">
        <p>This is an unlisted reader edition shared by its author.</p>
        <p className="mt-1">
          Recipients can still copy, print, save, or forward what they can read.
        </p>
        <Link className="mt-2 inline-block underline underline-offset-4" href="/">
          Made with sopher.ai
        </Link>
      </footer>
    </div>
  );
}
