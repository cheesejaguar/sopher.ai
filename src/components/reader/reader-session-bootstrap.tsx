"use client";

import * as React from "react";

import { readerSessionCookiePath } from "@/lib/reader-session";

/**
 * Reader secrets live in the URL fragment, which browsers never send in an
 * HTTP request. Exchange once for a scoped HttpOnly cookie, scrub the fragment,
 * then reload the same unsecret URL to render the immutable edition. When that
 * cookie is already valid, the component only scrubs and leaves the edition in
 * place.
 */
export function ReaderSessionBootstrap({
  shareId,
  hasValidSession = false,
}: {
  shareId: string;
  hasValidSession?: boolean;
}) {
  const [status, setStatus] = React.useState<"idle" | "opening" | "invalid" | "transient">("idle");
  const tokenRef = React.useRef<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);

  const exchange = React.useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("opening");
    try {
      const response = await fetch("/api/reader-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, token }),
        signal: controller.signal,
      });
      if (response.status === 404) {
        setStatus("invalid");
        return;
      }
      if (!response.ok) {
        setStatus("transient");
        return;
      }
      window.location.replace(readerSessionCookiePath(shareId));
    } catch {
      if (!controller.signal.aborted) setStatus("transient");
    }
  }, [shareId]);

  React.useEffect(() => {
    const scrubTokenFragment = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (!token) return null;

      tokenRef.current = token;
      // Keep Next's history state intact while replacing the secret-bearing
      // entry. This also handles a recipient reopening the original link after
      // a valid, path-scoped reader cookie has already been established.
      window.history.replaceState(window.history.state, "", readerSessionCookiePath(shareId));
      return token;
    };

    const token = scrubTokenFragment();

    if (hasValidSession) {
      // The immutable edition is already authorized by its HttpOnly cookie.
      // Do not post the bearer again or reload over the rendered manuscript;
      // only remove it if a same-document hash navigation reintroduces it.
      window.addEventListener("hashchange", scrubTokenFragment);
      return () => window.removeEventListener("hashchange", scrubTokenFragment);
    }

    if (!token) {
      const missingTimer = window.setTimeout(() => setStatus("invalid"), 0);
      return () => window.clearTimeout(missingTimer);
    }

    const timer = window.setTimeout(() => void exchange(), 0);
    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [exchange, hasValidSession, shareId]);

  if (status === "idle") return null;
  return (
    <div
      role={status === "invalid" || status === "transient" ? "alert" : "status"}
      aria-live={status === "invalid" ? "assertive" : "polite"}
      className="fixed inset-0 z-[100] grid place-items-center bg-background px-6 text-center"
    >
      <div className="max-w-md">
        <p className="folio-label text-primary">Reader edition</p>
        <p className="mt-3 text-lg font-semibold">
          {status === "opening"
            ? "Opening the book…"
            : status === "invalid"
              ? "This reader link is not available"
              : "The reader could not connect"}
        </p>
        {status === "invalid" ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            It may have expired or been revoked. Ask the author for a current link.
          </p>
        ) : status === "transient" ? (
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Your link is still held safely in this tab. Check your connection, then try again.
            </p>
            <button
              type="button"
              className="mt-4 min-h-11 rounded-sm border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => void exchange()}
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
