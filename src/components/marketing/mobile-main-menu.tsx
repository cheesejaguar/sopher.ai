"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { PublicNavLink } from "@/components/marketing/public-nav-link";

const ITEMS = [
  ["How it works", "/#how-it-works"],
  ["Genres", "/genres"],
  ["Guides", "/guides"],
  ["Pricing", "/pricing"],
] as const;

/**
 * The compact public navigation owns its disclosure state so the persistent
 * marketing layout cannot leave an open overlay over the next App Router page.
 */
export function MobileMainMenu() {
  const pathname = usePathname();
  const [openOnPathname, setOpenOnPathname] = useState<string | null>(null);
  const open = openOnPathname === pathname;

  return (
    <details
      open={open}
      onToggle={(event) => setOpenOnPathname(event.currentTarget.open ? pathname : null)}
      className="group relative md:hidden"
    >
      <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center border border-black/15 text-sm font-medium marker:hidden dark:border-white/15 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">{open ? "Close main menu" : "Open main menu"}</span>
        <span aria-hidden="true" className="grid gap-1">
          <span className="h-px w-4 bg-current" />
          <span className="h-px w-4 bg-current" />
          <span className="h-px w-4 bg-current" />
        </span>
      </summary>
      <div className="absolute top-[calc(100%+0.65rem)] right-0 w-64 border border-border bg-card p-2 shadow-2xl">
        {ITEMS.map(([label, href], index) => (
          <PublicNavLink
            key={href}
            href={href}
            match={
              href.includes("#")
                ? "none"
                : href === "/genres" || href === "/guides"
                  ? "section"
                  : "exact"
            }
            onClick={() => setOpenOnPathname(null)}
            currentClassName="border-l-primary bg-black/[0.035] text-foreground dark:border-l-primary dark:bg-white/[0.04]"
            className="grid min-h-11 grid-cols-[2rem_1fr] items-center border-b border-l border-black/8 border-l-transparent px-2 text-sm text-muted-foreground last:border-b-0 hover:bg-black/[0.035] hover:text-foreground dark:border-white/8 dark:border-l-transparent dark:hover:bg-white/[0.04]"
          >
            <span aria-hidden="true" className="font-mono text-[0.6875rem] text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            {label}
          </PublicNavLink>
        ))}
      </div>
    </details>
  );
}
