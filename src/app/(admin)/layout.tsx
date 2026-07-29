import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Feather } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/studio/theme-toggle";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/purchases", label: "Purchases" },
  { href: "/admin/books", label: "Books" },
  { href: "/admin/flags", label: "Flags" },
  { href: "/admin/runs", label: "Runs" },
] as const;

/**
 * The admin shell. requireAdmin() failing renders a plain 404 — the surface's
 * existence is not advertised to non-admins. The guard is an uncached DB read,
 * so with cacheComponents the ENTIRE shell (nav included — nothing may leak
 * into static HTML) renders inside the Suspense boundary around it.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl space-y-4 px-6 py-8">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <GuardedShell>{children}</GuardedShell>
    </Suspense>
  );
}

async function GuardedShell({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-6 px-6">
          <Link
            href="/admin"
            className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight"
          >
            <Feather aria-hidden="true" className="size-4 text-ember" />
            sopher.ai{" "}
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-ember" />
              admin
            </span>
          </Link>
          <nav aria-label="Admin">
            <ul className="flex items-center gap-1">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">
              Studio
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
