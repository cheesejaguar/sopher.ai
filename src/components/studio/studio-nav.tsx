"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Feather } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/studio/theme-toggle";

const links = [
  { href: "/studio", label: "Projects" },
  { href: "/studio/usage", label: "Usage" },
] as const;

/**
 * `"page"` only when the link *is* the current page; `"true"` when it merely
 * owns the current section (e.g. "Projects" while inside a project workspace).
 * Claiming `aria-current="page"` for a page you are not on misreports location
 * to screen readers.
 */
function currentState(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (href === "/studio") {
    return pathname.startsWith("/studio/new") || pathname.startsWith("/projects")
      ? "true"
      : undefined;
  }
  return pathname.startsWith(`${href}/`) ? "true" : undefined;
}

function NavLinks({ pathname }: { pathname?: string }) {
  return (
    <nav aria-label="Studio" className="flex items-center gap-1">
      {links.map((link) => {
        const current = pathname !== undefined ? currentState(pathname, link.href) : undefined;
        const active = current !== undefined;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavLinksWithPathname() {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} />;
}

export function StudioNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-6 px-6">
        <Link
          href="/studio"
          className="flex items-center gap-2 rounded-md font-display text-lg font-semibold tracking-tight"
        >
          <Feather aria-hidden="true" className="size-4 text-primary" />
          sopher.ai
        </Link>

        <Suspense fallback={<NavLinks />}>
          <NavLinksWithPathname />
        </Suspense>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/studio/settings" aria-label="Account and settings" className="rounded-full">
            <Avatar>
              <AvatarFallback>A</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
