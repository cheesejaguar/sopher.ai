import Link from "next/link";
import { ArrowRight, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EmptyLibrary() {
  return (
    <div className="instrument-surface-raised grid min-h-[28rem] overflow-hidden rounded-sm lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)]">
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <p className="folio-label text-primary">No manuscripts yet</p>
        <div className="mt-5 max-w-lg space-y-3">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-balance sm:text-3xl">
            Your first book starts with a brief.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Describe the story in your own words. The production moves through concept, outline,
            chapters, editing, and continuity—with credits quoted before anything begins.
          </p>
        </div>
        <Button
          render={<Link href="/studio/new" />}
          nativeButton={false}
          size="lg"
          className="mt-7 w-fit rounded-sm"
        >
          <PenLine aria-hidden="true" data-icon="inline-start" />
          Start a brief
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
