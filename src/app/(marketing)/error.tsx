"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AsyncState } from "@/components/studio/product-primitives";

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
      <AsyncState
        status="error"
        headingLevel={1}
        title="This page didn't load"
        description={`Something went wrong on our side. Trying again usually fixes it.${
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
        className="min-h-[50vh]"
      />
    </div>
  );
}
