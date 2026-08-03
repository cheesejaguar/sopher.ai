"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Link2, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { ReaderShareSummary } from "@/lib/publication-editions";

function shareStatus(share: ReaderShareSummary): string {
  if (share.status === "revoked") return "Revoked";
  if (share.status === "expired") return "Expired";
  if (!share.expiresAt) return "Active until revoked";
  const date = new Date(share.expiresAt);
  return `Active until ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)}`;
}

export function ShareReaderDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const [shares, setShares] = React.useState<ReaderShareSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [createdUrl, setCreatedUrl] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const createdUrlRef = React.useRef<HTMLInputElement>(null);

  const loadShares = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/reader-shares`);
      const body = (await response.json().catch(() => ({}))) as {
        shares?: ReaderShareSummary[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Reader links could not be loaded");
      setShares(body.shares ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Reader links could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void loadShares();
  }

  async function createShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError("");
    setCopied(false);
    const form = new FormData(event.currentTarget);
    const pendingKey = `sopher.reader-share-request:${projectId}`;
    const requestKey = window.sessionStorage.getItem(pendingKey) ?? crypto.randomUUID();
    window.sessionStorage.setItem(pendingKey, requestKey);
    try {
      const response = await fetch(`/api/projects/${projectId}/reader-shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey,
          label: String(form.get("label") ?? ""),
          expires: String(form.get("expires") ?? "30d"),
          allowDownload: form.get("allowDownload") === "on",
          acceptedReaderTerms: form.get("acceptedReaderTerms") === "on",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        share?: ReaderShareSummary;
        url?: string;
        error?: string;
      };
      if (!response.ok || !body.share || !body.url) {
        throw new Error(body.error ?? "The reader link could not be created");
      }
      setShares((current) => [
        body.share!,
        ...current.filter((share) => share.id !== body.share!.id),
      ]);
      setCreatedUrl(new URL(body.url, window.location.origin).toString());
      window.sessionStorage.removeItem(pendingKey);
      setAnnouncement("Reader link created. Copy the secret link now.");
      window.requestAnimationFrame(() => createdUrlRef.current?.focus());
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "The reader link could not be created",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      setAnnouncement("Reader link copied.");
    } catch {
      setCopied(false);
      setError("Copy was blocked by the browser. Select the link and copy it manually.");
    }
  }

  async function revoke(shareId: string) {
    if (revokingId) return;
    setRevokingId(shareId);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/reader-shares`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The reader link could not be revoked");
      setShares((current) =>
        current.map((share) =>
          share.id === shareId
            ? { ...share, status: "revoked", revokedAt: new Date().toISOString() }
            : share,
        ),
      );
      setAnnouncement("Reader link revoked.");
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "The reader link could not be revoked",
      );
    } finally {
      setRevokingId(null);
    }
  }

  const activeShares = shares.filter((share) => share.status === "active");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Link2 aria-hidden="true" />
        Share reader
      </DialogTrigger>
      <DialogContent className="max-h-[min(92dvh,48rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share a reader edition</DialogTitle>
          <DialogDescription>
            Capture the manuscript exactly as it is now and create a secret, revocable link. It is
            excluded from search engines and does not update when you keep editing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={createShare} className="space-y-5 border-y border-border py-5">
          <div className="space-y-1.5">
            <Label htmlFor="reader-share-label">Link label</Label>
            <Input
              id="reader-share-label"
              name="label"
              maxLength={120}
              placeholder="Beta readers, family, editor…"
            />
            <p className="text-xs text-muted-foreground">Only you see this label.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reader-share-expiry">Link expires</Label>
              <select
                id="reader-share-expiry"
                name="expires"
                defaultValue="30d"
                className="min-h-11 w-full rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <option value="7d">In 7 days</option>
                <option value="30d">In 30 days</option>
                <option value="never">Only when I revoke it</option>
              </select>
            </div>
            <label className="flex min-h-11 items-center gap-3 self-end rounded-sm border border-border px-3 py-2 text-sm">
              <input name="allowDownload" type="checkbox" className="size-4 accent-primary" />
              Show a Markdown download button
            </label>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This is an unlisted bearer link, not DRM. Anyone who has it can read, copy, print, save,
            or forward this captured edition. Revocation disables the reader page and download, but
            cannot recall copies a recipient already made. Deleting the project removes its reader
            editions.
          </p>
          <label className="flex min-h-11 items-start gap-3 rounded-sm border border-border px-3 py-3 text-sm">
            <input
              name="acceptedReaderTerms"
              type="checkbox"
              required
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              I understand that anyone with the link can access and redistribute this edition, and
              that revocation cannot recall copies already made.
            </span>
          </label>
          <Button
            type="submit"
            disabled={creating}
            aria-disabled={creating}
            aria-busy={creating || undefined}
          >
            {creating ? <Spinner aria-hidden="true" /> : <Link2 aria-hidden="true" />}
            {creating ? "Capturing edition…" : "Create secret reader link"}
          </Button>
        </form>

        {createdUrl ? (
          <section
            aria-labelledby="new-reader-link"
            className="space-y-3 border border-primary/35 p-4"
          >
            <div>
              <h3 id="new-reader-link" className="text-sm font-semibold">
                Copy this link now
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Sopher&rsquo;s database stores only a fingerprint of the secret. After a reload, you
                can revoke this link but cannot reveal it again.
              </p>
            </div>
            <Input
              ref={createdUrlRef}
              value={createdUrl}
              readOnly
              aria-label="New reader link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void copyUrl()}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={createdUrl} target="_blank" rel="noreferrer" />}
              >
                Open reader
                <ExternalLink aria-hidden="true" />
              </Button>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="active-reader-links" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="active-reader-links" className="text-sm font-semibold">
              Active links
            </h3>
            {loading ? <Spinner aria-label="Loading reader links" className="size-4" /> : null}
          </div>
          {!loading && activeShares.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active reader links.</p>
          ) : null}
          <ul className="divide-y divide-border border-y border-border">
            {activeShares.map((share) => (
              <li key={share.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{share.label ?? "Reader link"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {shareStatus(share)} · {share.chapterCount} chapters ·{" "}
                    {share.totalWords.toLocaleString("en-US")} words
                    {share.incomplete ? " · in-progress snapshot" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={revokingId === share.id}
                  onClick={() => void revoke(share.id)}
                >
                  {revokingId === share.id ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <ShieldOff aria-hidden="true" />
                  )}
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </DialogContent>
    </Dialog>
  );
}
