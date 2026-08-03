"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProjectExperience } from "@/lib/trial-story";
import {
  FULL_BOOK_UNLOCK_DESCRIPTION,
  INCLUDED_STORY_NO_CARD_NOTE,
} from "@/lib/marketing/trial-offer";

/**
 * Shown on the write screen while the run is suspended for credits.
 *
 * Everything drafted so far is durable. Full books return through checkout,
 * which submits the accepted top-up input automatically. An included story
 * never turns a product-side credit pause into a purchase prompt; its
 * "Check again" control only revalidates the existing included entitlement.
 */
export function CreditsBanner({
  projectId,
  runId,
  detail,
  experience = "full_book",
  fullBookUnlocked = false,
  supportReference,
}: {
  projectId: string;
  runId: string;
  detail?: string;
  experience?: ProjectExperience;
  fullBookUnlocked?: boolean;
  supportReference?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const includedStory = experience === "trial_short_story";

  async function recheckIncludedStory() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${runId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "credits-topup" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(
          response.status === 402
            ? includedStory
              ? "Your included story should not need a purchase. Try again in a moment; if it remains paused, contact support@sopher.ai."
              : "Your balance is still empty — add credits first."
            : (body.error ?? "Could not resume the run"),
        );
        return;
      }
      // The run stream picks the accepted input up on its own.
    } catch {
      setError("Could not resume the run");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-sm border border-ember/40 bg-ember/5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Wallet aria-hidden="true" className="size-4 shrink-0 text-ember" />
          <div>
            <p className="text-sm font-medium">
              {includedStory
                ? "Production paused before the included story finished."
                : "Writing is paused — out of credits."}
            </p>
            <p className="text-xs text-muted-foreground">
              {includedStory ? (
                <>
                  {INCLUDED_STORY_NO_CARD_NOTE} Every chapter drafted so far is safe. Check again;
                  {fullBookUnlocked
                    ? " your account’s full-length controls are already unlocked."
                    : ` a purchase is optional here and is only the next step for future full-length books. ${FULL_BOOK_UNLOCK_DESCRIPTION}`}
                </>
              ) : (
                <>
                  {detail ? `${detail}. ` : ""}Every chapter drafted so far is safe; the book
                  continues exactly where it stopped once you top up.
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {includedStory ? (
            <>
              <Button onClick={recheckIncludedStory} disabled={busy}>
                {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                {busy ? "Checking…" : "Check again"}
              </Button>
              <Button
                variant="outline"
                render={
                  <a
                    href={`mailto:support@sopher.ai?subject=${encodeURIComponent(
                      `Included story pause${supportReference ? ` ${supportReference}` : ""}`,
                    )}`}
                  />
                }
                nativeButton={false}
              >
                Get help
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              render={
                <Link
                  href={`/studio/credits?return=${encodeURIComponent(`/projects/${projectId}/write`)}&resumeRun=${encodeURIComponent(runId)}`}
                />
              }
              nativeButton={false}
            >
              Add credits
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
