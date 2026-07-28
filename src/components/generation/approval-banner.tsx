"use client";

import Link from "next/link";
import { FileCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shown on the write screen while the run is paused for outline approval. */
export function ApprovalBanner({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <FileCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">The outline is ready for your review.</p>
          <p className="text-xs text-muted-foreground">
            Writing is paused until you approve it or ask for changes.
          </p>
        </div>
      </div>
      <Button render={<Link href={`/projects/${projectId}/outline`} />} nativeButton={false}>
        Review the outline
      </Button>
    </div>
  );
}
