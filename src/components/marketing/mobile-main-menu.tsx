"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { PublicNavLink } from "@/components/marketing/public-nav-link";
import { PublicThemeToggle } from "@/components/marketing/public-theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ITEMS = [
  ["How it works", "/#how-it-works"],
  ["Genres", "/genres"],
  ["Guides", "/guides"],
  ["Pricing", "/pricing"],
] as const;

/** Accessible public navigation that reflows independently of header copy. */
export function MobileMainMenu() {
  const pathname = usePathname();
  const [openOnPathname, setOpenOnPathname] = useState<string | null>(null);
  const open = openOnPathname === pathname;
  const setOpen = (next: boolean) => setOpenOnPathname(next ? pathname : null);

  return (
    <span className="shrink-0 min-[1200px]:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              type="button"
              aria-label="Open main menu"
              className="grid min-h-11 min-w-11 shrink-0 place-items-center border border-black/15 dark:border-white/15"
            />
          }
        >
          <span aria-hidden="true" className="grid gap-1">
            <span className="h-px w-4 bg-current" />
            <span className="h-px w-4 bg-current" />
            <span className="h-px w-4 bg-current" />
          </span>
        </SheetTrigger>
        <SheetContent side="right" className="w-[min(100vw,24rem)] gap-0 border-border p-0">
          <SheetHeader className="border-b border-border p-5 pr-16 text-left">
            <SheetTitle>
              <BrandMark />
              <span className="sr-only">Main menu</span>
            </SheetTitle>
            <SheetDescription>Explore the product or begin your story.</SheetDescription>
          </SheetHeader>

          <nav aria-label="Main menu" className="min-h-0 flex-1 overflow-y-auto p-4">
            <Link
              href="/studio"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="mb-4 flex min-h-12 items-center justify-center rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Start your book
            </Link>
            <div className="border-t border-border">
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
                  onClick={() => setOpen(false)}
                  currentClassName="text-foreground"
                  className="grid min-h-12 grid-cols-[2rem_minmax(0,1fr)] items-center border-b border-border px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <span aria-hidden="true" className="font-mono text-[0.6875rem] text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
                </PublicNavLink>
              ))}
            </div>
          </nav>

          <SheetFooter className="border-t border-border p-4">
            <div className="flex min-h-12 items-center justify-between gap-4 px-2">
              <span className="text-sm text-muted-foreground">Appearance</span>
              <PublicThemeToggle />
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </span>
  );
}
