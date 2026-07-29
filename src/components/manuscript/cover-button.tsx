"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Generates (or replaces) the book cover. Priced per image, on demand only. */
export function CoverButton({ projectId, hasCover }: { projectId: string; hasCover: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/cover`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not generate a cover");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not generate a cover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button variant="ghost" size="sm" onClick={generate} disabled={busy}>
        {busy ? (
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        ) : (
          <ImagePlus aria-hidden="true" className="size-3.5" />
        )}
        {busy ? "Painting…" : hasCover ? "New cover · $0.067" : "Generate cover · $0.067"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
