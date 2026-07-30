"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { adminCancelRun } from "@/lib/actions/admin";

export function CancelRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="destructive"
        size="sm"
        className="h-11 px-2 text-xs sm:h-7"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await adminCancelRun(runId);
              router.refresh();
            } catch {
              setError("Cancel failed");
            }
          });
        }}
      >
        {pending ? "Cancelling…" : "Cancel run"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
