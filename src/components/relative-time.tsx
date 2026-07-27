"use client";

import { useSyncExternalStore } from "react";

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

const emptySubscribe = () => () => {};

/** Renders a relative date on the client only, so server prerender stays time-independent. */
export function RelativeTime({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    emptySubscribe,
    () => formatRelative(iso),
    () => "",
  );
  return <time dateTime={iso}>{label}</time>;
}
