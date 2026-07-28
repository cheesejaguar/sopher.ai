"use client";

import dynamic from "next/dynamic";

import { EditorSkeleton } from "./editor-skeleton";
import type { EditorShellProps } from "./editor-shell";

/**
 * Client-side loader for the heavy editor island (TipTap + plugins). The
 * shell touches window/matchMedia freely, so it renders client-only with a
 * designed skeleton while the chunk streams in.
 */
const EditorShell = dynamic(() => import("./editor-shell").then((m) => m.EditorShell), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

export function EditorShellLoader(props: EditorShellProps) {
  return <EditorShell {...props} />;
}
