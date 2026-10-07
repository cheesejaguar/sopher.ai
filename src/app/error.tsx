"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AsyncState } from "@/components/studio/product-primitives";

/**
 * Catches what the route-group boundaries cannot: an error thrown by a group
 * layout itself (marketing, studio, admin) renders here, inside the root
 * layout, so it supplies its own page landmark. global-error.tsx remains the
 * last resort for a failing root layout.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="instrument-canvas grid min-h-dvh place-items-center px-5 py-12 outline-none"
    >
      <AsyncState
        status="error"
        headingLevel={1}
        title="Something went sideways"
        description={`sopher.ai hit an unexpected error. Your books and drafts are safe — trying again usually fixes it.${
          error.digest ? ` Error ${error.digest}.` : ""
        }`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button variant="ghost" render={<Link href="/" />} nativeButton={false}>
              Return home
            </Button>
          </div>
        }
        className="w-full max-w-xl bg-background/95"
      />
    </main>
  );
}
