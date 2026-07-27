import Link from "next/link";
import { PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      <div className="relative" aria-hidden="true">
        <div className="absolute top-2 -left-3 h-28 w-22 -rotate-6 rounded-sm border border-paper-edge bg-paper/60" />
        <div className="relative h-28 w-22 rotate-2 space-y-2 rounded-sm border border-paper-edge bg-paper p-3 shadow-sm">
          <div className="h-1.5 w-1/2 rounded-full bg-paper-edge" />
          <div className="h-1.5 w-full rounded-full bg-paper-edge/70" />
          <div className="h-1.5 w-full rounded-full bg-paper-edge/70" />
          <div className="h-1.5 w-3/4 rounded-full bg-paper-edge/70" />
          <div className="h-1.5 w-5/6 rounded-full bg-paper-edge/70" />
          <div className="h-1.5 w-1/3 rounded-full bg-paper-edge/70" />
        </div>
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Your first book starts with a brief.
        </h2>
        <p className="text-sm text-muted-foreground">
          Describe the story you want in a few paragraphs. Five agents plan, draft, and edit it into
          a finished manuscript — with the cost quoted up front.
        </p>
      </div>
      <Button render={<Link href="/studio/new" />} nativeButton={false}>
        <PenLine aria-hidden="true" data-icon="inline-start" />
        Start a brief
      </Button>
    </div>
  );
}
