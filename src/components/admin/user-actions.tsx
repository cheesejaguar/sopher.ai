"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff, ShieldCheck, Wallet } from "lucide-react";

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
import { adminAdjustCredits, adminSetSuspended } from "@/lib/actions/admin";

/** Credit adjustment + suspension controls on the admin user page. */
export function UserActions({
  userId,
  email,
  suspended,
  isSelf,
}: {
  userId: string;
  email: string;
  suspended: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function adjust(formData: FormData) {
    setError(null);
    const credits = Number(formData.get("credits"));
    const reason = String(formData.get("reason") ?? "").trim();
    startTransition(async () => {
      try {
        await adminAdjustCredits({ userId, credits, reason });
        setAdjustOpen(false);
        router.refresh();
      } catch {
        setError("Adjustment failed — check the values.");
      }
    });
  }

  function toggleSuspension() {
    setError(null);
    startTransition(async () => {
      try {
        await adminSetSuspended(userId, !suspended);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not update suspension");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Wallet aria-hidden="true" className="size-3.5" />
          Adjust credits
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust credits for {email}</DialogTitle>
            <DialogDescription>
              Positive grants, negative claws back. Lands in the append-only ledger with your admin
              id in the reference.
            </DialogDescription>
          </DialogHeader>
          <form action={adjust} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="adj-credits">Credits</Label>
              <Input
                id="adj-credits"
                name="credits"
                type="number"
                step="0.1"
                min={-1000}
                max={1000}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-reason">Reason (recorded in the ledger)</Label>
              <Input id="adj-reason" name="reason" required minLength={3} maxLength={300} />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Applying…" : "Apply"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Button
        variant={suspended ? "outline" : "destructive"}
        size="sm"
        onClick={toggleSuspension}
        disabled={pending || (isSelf && !suspended)}
        title={isSelf && !suspended ? "You cannot suspend your own account" : undefined}
      >
        {suspended ? (
          <>
            <ShieldCheck aria-hidden="true" className="size-3.5" /> Unsuspend
          </>
        ) : (
          <>
            <ShieldOff aria-hidden="true" className="size-3.5" /> Suspend
          </>
        )}
      </Button>
      {error && !adjustOpen ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
