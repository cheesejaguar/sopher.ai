"use client";

import dynamic from "next/dynamic";

/**
 * The shared toggle reads the persisted theme. Mounting it after hydration
 * keeps its state-dependent accessible label from disagreeing with SSR.
 */
const ThemeToggle = dynamic(
  () => import("@/components/studio/theme-toggle").then((module) => module.ThemeToggle),
  {
    ssr: false,
    loading: () => <span aria-hidden="true" className="block size-11" />,
  },
);

export function PublicThemeToggle() {
  return <ThemeToggle />;
}
