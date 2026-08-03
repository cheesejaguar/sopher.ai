"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { adminRedeliverRunInput, adminRedispatchRun } from "@/lib/actions/admin";

type RunRecoveryButtonProps =
  { action: "redispatch"; runId: string } | { action: "redeliver"; inputId: string };

export function RunRecoveryButton(props: RunRecoveryButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const redispatch = props.action === "redispatch";

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 sm:min-h-7"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              if (props.action === "redispatch") {
                await adminRedispatchRun(props.runId);
              } else {
                await adminRedeliverRunInput(props.inputId);
              }
              router.refresh();
            } catch {
              setError(
                redispatch
                  ? "The evidence does not permit a safe redispatch."
                  : "The input could not be safely redelivered.",
              );
            }
          });
        }}
      >
        {redispatch ? <RotateCcw aria-hidden="true" /> : <Send aria-hidden="true" />}
        {pending
          ? redispatch
            ? "Retrying…"
            : "Sending…"
          : redispatch
            ? "Retry same run"
            : "Redeliver"}
      </Button>
      {error ? (
        <span role="alert" className="max-w-56 text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
