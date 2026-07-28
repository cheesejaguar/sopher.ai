"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // The current theme is otherwise conveyed only by a CSS-swapped icon, so a
  // screen reader user cannot tell which way the control will move. `undefined`
  // before hydration keeps the server and first client render identical.
  const label = resolvedTheme
    ? resolvedTheme === "dark"
      ? "Switch to light theme"
      : "Switch to dark theme"
    : "Toggle theme";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun aria-hidden="true" className="dark:hidden" />
      <Moon aria-hidden="true" className="hidden dark:block" />
    </Button>
  );
}
