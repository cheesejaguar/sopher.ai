"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type PublicNavLinkProps = Omit<ComponentProps<typeof Link>, "aria-current"> & {
  currentClassName?: string;
  match?: "exact" | "section" | "none";
};

function exactPath(href: ComponentProps<typeof Link>["href"]): string {
  const pathname = typeof href === "string" ? href : (href.pathname ?? "/");
  return pathname.split(/[?#]/, 1)[0] || "/";
}

/**
 * Public navigation is positional: exact links identify the current page,
 * while section links can identify a descendant location. Hash jumps such as
 * “How it works” remain locations within the home page, not a second current
 * page alongside the home wordmark.
 */
export function PublicNavLink({
  href,
  currentClassName,
  match = "exact",
  className,
  prefetch = false,
  ...props
}: PublicNavLinkProps) {
  const pathname = usePathname();
  const targetPath = exactPath(href);
  const exact = match !== "none" && pathname === targetPath;
  const descendant =
    match === "section" && targetPath !== "/" && pathname.startsWith(`${targetPath}/`);
  const current = exact || descendant;

  // Desktop and mobile navigation are both server-rendered, then hidden by
  // breakpoint. Avoid prefetching every hidden destination during the
  // homepage's LCP window; individual callers can still opt back in.
  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetch}
      aria-current={exact ? "page" : descendant ? "location" : undefined}
      className={cn(className, current && currentClassName)}
    />
  );
}
