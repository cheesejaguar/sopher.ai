"use client";

import { useSyncExternalStore } from "react";

const CLIENT_NOW_TICK_MS = 30_000;

const listeners = new Set<() => void>();
let snapshot: number | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  snapshot = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    // A clock that sat unsubscribed may be stale; React re-reads the snapshot
    // after subscribing and re-renders if this refresh changed it.
    snapshot = Date.now();
    timer = setInterval(tick, CLIENT_NOW_TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

// getSnapshot must return the same value until the store changes, so the
// clock is read once and then only advanced by the shared tick.
function getSnapshot(): number {
  snapshot ??= Date.now();
  return snapshot;
}

function getServerSnapshot(): null {
  return null;
}

/**
 * Wall-clock milliseconds that exist only after hydration, refreshed every 30
 * seconds. The server render and the hydrating client render both see null,
 * so time-dependent text renders identically on both and cannot trigger a
 * hydration mismatch (or read the clock during a server prerender). Callers
 * render a time-independent fallback for null.
 */
export function useClientNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
