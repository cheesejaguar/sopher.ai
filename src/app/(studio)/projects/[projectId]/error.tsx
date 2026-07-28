"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-5 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert aria-hidden="true" className="size-5" />
      </span>
      <div className="max-w-md space-y-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          This workspace failed to load.
        </h2>
        <p className="text-sm text-muted-foreground">
          The manuscript itself is safe. Try again, or head back to your shelf.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="ghost" render={<Link href="/studio" />} nativeButton={false}>
          Back to your books
        </Button>
      </div>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Error {error.digest}</p>
      ) : null}
    </div>
  );
}
