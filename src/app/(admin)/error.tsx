"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AsyncState } from "@/components/studio/product-primitives";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AsyncState
      status="error"
      headingLevel={1}
      title="This admin view failed to load"
      description={`The admin console hit an unexpected error while rendering. Try again, or return to the overview.${
        error.digest ? ` Error ${error.digest}.` : ""
      }`}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="ghost" render={<Link href="/admin" />} nativeButton={false}>
            Back to admin
          </Button>
        </div>
      }
      className="min-h-[50vh]"
    />
  );
}
