import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import "@clerk/ui/themes/shadcn.css";

import { clerkEnabled } from "@/lib/clerk";

const clerkAppearance = {
  theme: shadcn,
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--ember)",
    colorNeutral: "var(--foreground)",
    colorForeground: "var(--foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorBackground: "var(--card)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorRing: "var(--ring)",
    colorBorder: "var(--border)",
    colorShadow: "var(--background)",
    colorModalBackdrop: "var(--background)",
    fontFamily: "var(--font-archivo), Arial, sans-serif",
    fontFamilyButtons: "var(--font-archivo), Arial, sans-serif",
    fontFamilyMono:
      'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: "0.875rem",
    borderRadius: "0.25rem",
  },
} as const;

/**
 * Clerk is intentionally scoped to routes that render account UI. Keeping it
 * out of the root layout prevents public marketing pages from downloading the
 * auth client and theme stylesheet.
 */
export function ClerkRouteProvider({ children }: { children: ReactNode }) {
  return clerkEnabled ? (
    <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>
  ) : (
    children
  );
}
