"use client";

import { Button } from "@/components/ui/button";

export function StudioCoachmark({
  title,
  children,
  onDismiss,
}: {
  title: string;
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <aside
      aria-label={title}
      className="border-y border-primary/35 bg-primary/6 px-3 py-3 text-foreground"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        className="mt-2 min-h-11 rounded-sm px-2 text-xs text-primary"
      >
        Got it
      </Button>
    </aside>
  );
}
