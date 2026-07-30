"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { adminSetFlagStatus } from "@/lib/actions/admin";

export function FlagActions({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function settle(status: "dismissed" | "actioned") {
    setError(null);
    startTransition(async () => {
      try {
        await adminSetFlagStatus(flagId, status);
        router.refresh();
      } catch {
        setError("Update failed");
      }
    });
  }

  return (
    <span className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-11 px-2 text-xs sm:h-7"
        disabled={pending}
        onClick={() => settle("dismissed")}
      >
        Dismiss
      </Button>
      <Button
        variant="destructive"
        size="sm"
        className="h-11 px-2 text-xs sm:h-7"
        disabled={pending}
        onClick={() => settle("actioned")}
      >
        Actioned
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
