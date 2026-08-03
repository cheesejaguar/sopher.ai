import Link from "next/link";
import { ArrowRight, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FULL_BOOK_UNLOCK_DESCRIPTION,
  FULL_BOOK_UNLOCK_HREF,
  INCLUDED_STORY_NO_CARD_NOTE,
} from "@/lib/marketing/trial-offer";

type EmptyLibraryMode = "included_story" | "full_book" | "verify_email" | "purchase_required";

const EMPTY_LIBRARY_COPY: Record<
  EmptyLibraryMode,
  {
    title: string;
    description: string;
    action: string;
    href: "/studio/new" | typeof FULL_BOOK_UNLOCK_HREF;
  }
> = {
  included_story: {
    title: "Turn one idea into a complete short story.",
    description: `Write three chapters with the complete Studio, story bible, editor, manuscript, and export experience. ${INCLUDED_STORY_NO_CARD_NOTE} When you are ready to go full length, the next step is simple. ${FULL_BOOK_UNLOCK_DESCRIPTION}`,
    action: "Create my included story",
    href: "/studio/new",
  },
  full_book: {
    title: "Your next book starts with a brief.",
    description:
      "Describe the story in your own words, choose its length and quality, and review the credit quote before production begins.",
    action: "Start a full-length book",
    href: "/studio/new",
  },
  verify_email: {
    title: "Verify your email to begin.",
    description:
      "A verified account includes one complete short story with every Studio tool and no card required. Continue to see the verification reminder.",
    action: "Continue",
    href: "/studio/new",
  },
  purchase_required: {
    title: "Unlock your next full-length book.",
    description: `${FULL_BOOK_UNLOCK_DESCRIPTION} Credits are then used only for work that actually runs.`,
    action: "View credit packs",
    href: FULL_BOOK_UNLOCK_HREF,
  },
};

export function EmptyLibrary({ mode }: { mode: EmptyLibraryMode }) {
  const copy = EMPTY_LIBRARY_COPY[mode];

  return (
    <div className="instrument-surface grid min-h-[28rem] overflow-hidden rounded-sm lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)]">
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <div className="max-w-lg space-y-3">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-balance sm:text-3xl">
            {copy.title}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            {copy.description}
          </p>
        </div>
        <Button
          render={<Link href={copy.href} />}
          nativeButton={false}
          size="lg"
          className="mt-7 w-fit rounded-sm"
        >
          <PenLine aria-hidden="true" data-icon="inline-start" />
          {copy.action}
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Button>
      </div>
      <div className="relative hidden min-h-[28rem] border-l border-border bg-background/45 lg:block">
        <span aria-hidden="true" className="spectral-rule absolute top-0 bottom-0 left-16 w-px" />
        <ol className="absolute inset-y-10 right-8 left-24 flex flex-col justify-between">
          {["Concept", "Outline", "Chapters", "Editor", "Continuity"].map((stage, index) => (
            <li key={stage} className="flex items-center gap-4">
              <span className="font-mono text-xs text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="manuscript-sheet flex min-h-14 flex-1 items-center px-5 font-serif text-sm">
                {stage}
              </span>
            </li>
          ))}
        </ol>
        <p className="absolute right-8 bottom-3 folio-label text-muted-foreground">
          Brief → finished manuscript
        </p>
      </div>
    </div>
  );
}
