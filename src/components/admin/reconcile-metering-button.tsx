"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  adminReconcileChargedMeteringIntent,
  adminReconcileUnchargedMeteringIntent,
} from "@/lib/actions/admin";

export function ReconcileMeteringButton({ intentRef }: { intentRef: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"uncharged" | "charged">("uncharged");

  function submitUncharged(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const note = String(data.get("note") ?? "").trim();
    const confirmed = data.get("confirmed") === "yes";
    if (!confirmed) {
      setError("Confirm the Gateway check before releasing the hold.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await adminReconcileUnchargedMeteringIntent({
          intentRef,
          confirmation: "verified_no_gateway_charge",
          note,
        });
        setOpen(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not reconcile the intent");
      }
    });
  }

  function submitCharged(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const note = String(data.get("note") ?? "").trim();
    if (data.get("confirmed") !== "yes") {
      setError("Confirm the Gateway usage before settling the hold.");
      return;
    }
    let calls: unknown;
    try {
      calls = JSON.parse(String(data.get("calls") ?? "[]"));
    } catch {
      setError("Usage rows must be valid JSON.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await adminReconcileChargedMeteringIntent({
          intentRef,
          confirmation: "verified_gateway_charge",
          note,
          calls,
        });
        setOpen(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not settle the intent");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) setOpen(nextOpen);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Review hold</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile provider attempt</DialogTitle>
          <DialogDescription>
            Match the attempt or generation id in Vercel AI Gateway, then either release an
            uncharged hold or settle and refund verified undelivered usage so the action can retry.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2" role="group" aria-label="Reconciliation outcome">
          <Button
            type="button"
            size="sm"
            variant={mode === "uncharged" ? "default" : "outline"}
            onClick={() => setMode("uncharged")}
          >
            No charge
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "charged" ? "default" : "outline"}
            onClick={() => setMode("charged")}
          >
            Charged
          </Button>
        </div>
        {mode === "uncharged" ? (
          <form className="space-y-4" onSubmit={submitUncharged}>
            <div className="space-y-1.5">
              <Label htmlFor={`reconcile-note-${intentRef}`}>Gateway verification note</Label>
              <Input
                id={`reconcile-note-${intentRef}`}
                name="note"
                required
                minLength={10}
                maxLength={500}
                placeholder="No generation found for attempt tag…"
              />
            </div>
            <label className="flex min-h-11 items-start gap-3 text-sm leading-5">
              <input
                className="mt-1 size-4"
                type="checkbox"
                name="confirmed"
                value="yes"
                required
              />
              <span>I verified this attempt has no billable Gateway generation.</span>
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Releasing…" : "Release verified hold"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={submitCharged}>
            <div className="space-y-1.5">
              <Label htmlFor={`charged-note-${intentRef}`}>Gateway verification note</Label>
              <Input
                id={`charged-note-${intentRef}`}
                name="note"
                required
                minLength={10}
                maxLength={500}
                placeholder="Matched generation id gen_…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`charged-calls-${intentRef}`}>Verified Gateway usage JSON</Label>
              <Textarea
                id={`charged-calls-${intentRef}`}
                name="calls"
                required
                rows={8}
                className="font-mono text-xs"
                defaultValue={`[
  {
    "model": "anthropic/claude-sonnet-5",
    "inputTokens": 0,
    "outputTokens": 0,
    "cachedInputTokens": 0,
    "cacheWriteTokens": 0,
    "reasoningTokens": 0,
    "imageCount": 0
  }
]`}
              />
            </div>
            <label className="flex min-h-11 items-start gap-3 text-sm leading-5">
              <input
                className="mt-1 size-4"
                type="checkbox"
                name="confirmed"
                value="yes"
                required
              />
              <span>I copied every billable step exactly from the matching Gateway attempt.</span>
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Settling…" : "Settle, refund, and allow redo"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
