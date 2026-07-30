"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AsyncState } from "@/components/studio/product-primitives";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AsyncState
      status="error"
      headingLevel={2}
      title="This workspace failed to load"
      description={`The manuscript itself is safe. Try again, or head back to your shelf.${
        error.digest ? ` Error ${error.digest}.` : ""
      }`}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="ghost" render={<Link href="/studio" />} nativeButton={false}>
            Back to your books
          </Button>
        </div>
      }
      className="min-h-[40vh]"
    />
  );
}
