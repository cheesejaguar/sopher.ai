"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { adminRecheckRun } from "@/lib/actions/admin";

export function RecheckRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await adminRecheckRun(runId);
              router.refresh();
            } catch {
              setError("The run could not be checked.");
            }
          });
        }}
      >
        <RefreshCw
          aria-hidden="true"
          className={pending ? "animate-spin motion-reduce:animate-none" : ""}
        />
        {pending ? "Checking…" : "Recheck now"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
