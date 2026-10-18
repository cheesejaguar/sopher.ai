"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AsyncState } from "@/components/studio/product-primitives";

/**
 * Reader routes have no layout of their own, so this boundary supplies the
 * page landmark the skip link targets. A reader may be anyone holding a share
 * link, so the copy says nothing about the edition or its author.
 */
export default function ReaderError({
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
        title="This edition didn't open"
        description={`The reader hit an unexpected error. Trying again usually fixes it.${
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
