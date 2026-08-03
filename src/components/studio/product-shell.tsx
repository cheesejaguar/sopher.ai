"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  BookPlus,
  Coins,
  CircleHelp,
  CreditCard,
  Flag,
  Gauge,
  Library,
  Menu,
  PanelLeft,
  Search,
  Settings2,
  ShieldCheck,
  SunMoon,
  Users,
  Workflow,
} from "lucide-react";

import { clerkEnabled } from "@/lib/clerk";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CommandPalette } from "@/components/studio/command-palette";
import {
  AuthoringJourneyCommandProvider,
  useAuthoringJourneyCommand,
} from "@/components/studio/authoring-journey-command";
import { StudioHelp } from "@/components/studio/studio-help";
import { StudioHelpProvider } from "@/components/studio/studio-help-context";
import { StudioCoachmark } from "@/components/studio/studio-coachmark";
import { ThemeToggle } from "@/components/studio/theme-toggle";
import type { AuthoringOnboardingPreferences } from "@/lib/authoring-onboarding-shared";
import {
  SUSPENDED_AUTHORING_MESSAGE,
  StudioSuspensionProvider,
} from "@/components/studio/studio-access-context";

type ShellVariant = "studio" | "admin";

type ShellLink = {
  href: Route;
  label: string;
  detail?: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  exact?: boolean;
};

const STUDIO_PRIMARY: ShellLink[] = [
  { href: "/studio", label: "Your books", detail: "Library", icon: Library, exact: true },
  { href: "/studio/new", label: "Start a book", detail: "New brief", icon: BookPlus },
  { href: "/studio/credits", label: "Credits", detail: "Balance & top up", icon: Coins },
];

const STUDIO_SECONDARY: ShellLink[] = [
  { href: "/studio/usage", label: "Usage", icon: BarChart3 },
  { href: "/studio/settings", label: "Settings", icon: Settings2 },
];

const ADMIN_PRIMARY: ShellLink[] = [
  { href: "/admin", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/metrics", label: "Metrics", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/purchases", label: "Purchases", icon: CreditCard },
  { href: "/admin/books", label: "Books", icon: BookOpen },
  { href: "/admin/flags", label: "Flags", icon: Flag },
  { href: "/admin/runs", label: "Runs", icon: Workflow },
];

function isCurrent(pathname: string, link: ShellLink, variant: ShellVariant) {
  if (link.exact) {
    if (pathname === link.href) return "page" as const;
    if (variant === "studio" && link.href === "/studio" && pathname.startsWith("/projects/")) {
      return "true" as const;
    }
    return undefined;
  }
  if (pathname === link.href) return "page" as const;
  if (pathname.startsWith(`${link.href}/`)) return "true" as const;
  return undefined;
}

function ProductMark({
  variant,
  showContext = true,
}: {
  variant: ShellVariant;
  showContext?: boolean;
}) {
  return (
    <Link
      href={variant === "admin" ? "/admin" : "/studio"}
      className="group flex min-h-11 min-w-0 items-center gap-3 rounded-sm"
    >
      <BrandMark className="text-sidebar-foreground" />
      <span className={cn("min-w-0", showContext ? "block" : "hidden")}>
        <span className="block font-mono text-[0.6875rem] tracking-[0.12em] text-sidebar-foreground/75 uppercase">
          {variant === "admin" ? "Control room" : "Writing studio"}
        </span>
      </span>
    </Link>
  );
}

function Navigation({
  variant,
  pathname,
  mobile = false,
  credits,
  creditLabel,
}: {
  variant: ShellVariant;
  pathname: string;
  mobile?: boolean;
  credits?: number;
  creditLabel?: string;
}) {
  const primary = variant === "admin" ? ADMIN_PRIMARY : STUDIO_PRIMARY;
  const secondary = variant === "studio" ? STUDIO_SECONDARY : [];

  const list = (links: ShellLink[], label: string) => (
    <div className="space-y-1">
      <p className="px-3 pb-1 font-mono text-[0.6875rem] tracking-[0.16em] text-sidebar-foreground/75 uppercase">
        {label}
      </p>
      <ul className="space-y-1">
        {links.map((link) => {
          const current = isCurrent(pathname, link, variant);
          const active = current !== undefined;
          const detail = link.detail;
          const Icon = link.icon;
          const content = (
            <Link
              href={link.href}
              aria-current={current}
              className={cn(
                "group relative flex min-h-11 items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-2 left-0 w-px bg-transparent",
                  active && (variant === "admin" ? "bg-ember" : "bg-primary"),
                )}
              />
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0",
                  active
                    ? variant === "admin"
                      ? "text-ember"
                      : "text-primary"
                    : "text-sidebar-foreground/75",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{link.label}</span>
                {detail ? (
                  <span className="block truncate text-[0.6875rem] text-sidebar-foreground/75">
                    {detail}
                  </span>
                ) : null}
              </span>
              {link.href === "/studio/credits" ? (
                <span className="font-mono text-[0.6875rem] tracking-wider text-sidebar-foreground/75 uppercase">
                  {credits === undefined ? (creditLabel ?? "Top up") : `${credits.toFixed(1)} cr`}
                </span>
              ) : null}
            </Link>
          );
          return (
            <li key={link.href}>
              {mobile ? <SheetClose nativeButton={false} render={content} /> : content}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <nav aria-label={variant === "admin" ? "Admin" : "Studio"} className="space-y-6">
      {list(primary, variant === "admin" ? "Admin" : "Create & manage")}
      {secondary.length > 0 ? list(secondary, "Account") : null}
    </nav>
  );
}

function CommandButton({ compact = false, onOpen }: { compact?: boolean; onOpen: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      aria-label="Open command palette"
      className={cn(
        "rounded-sm border border-sidebar-border bg-sidebar-accent/45 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        compact ? "size-11 p-0" : "h-10 w-full justify-start px-3",
      )}
    >
      <Search aria-hidden="true" className="size-4" />
      {compact ? null : (
        <>
          <span className="flex-1 text-left">Find anything</span>
          <kbd className="font-mono text-[0.6875rem] text-sidebar-foreground/75">⌘K</kbd>
        </>
      )}
    </Button>
  );
}

function ShellUtilities({
  variant,
  mobile = false,
  onOpenHelp,
}: {
  variant: ShellVariant;
  mobile?: boolean;
  onOpenHelp?: () => void;
}) {
  const studioLink = (
    <Link
      href="/studio"
      className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <PanelLeft aria-hidden="true" className="size-4" />
      Back to Studio
    </Link>
  );

  return (
    <div className={cn("space-y-3", mobile && "border-t border-sidebar-border pt-4")}>
      {variant === "admin" ? (
        mobile ? (
          <SheetClose nativeButton={false} render={studioLink} />
        ) : (
          studioLink
        )
      ) : null}
      {variant === "studio" && onOpenHelp ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onOpenHelp}
          aria-haspopup="dialog"
          className="min-h-11 w-full justify-start gap-3 rounded-sm px-3 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <CircleHelp aria-hidden="true" className="size-4" />
          <span>
            <span className="block text-left text-sm font-medium">Help</span>
            <span className="block text-left text-[0.6875rem] font-normal text-sidebar-foreground/75">
              Guidance &amp; support
            </span>
          </span>
        </Button>
      ) : null}
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-sm border border-sidebar-border px-3">
        <span className="flex items-center gap-3 text-sm text-sidebar-foreground/75">
          <SunMoon aria-hidden="true" className="size-4 text-sidebar-foreground/75" />
          Theme
        </span>
        <ThemeToggle />
      </div>
      <div className="flex min-h-12 items-center gap-3 px-3">
        {clerkEnabled ? (
          <UserButton
            appearance={{
              elements: {
                userButtonTrigger: "size-11 sm:size-8",
                userButtonAvatarBox: "size-8",
              },
            }}
            userProfileMode="modal"
          />
        ) : (
          <Link
            href="/studio/settings"
            aria-label="Account and settings"
            className="grid size-11 place-items-center rounded-full sm:size-8"
          >
            <Avatar className="size-8">
              <AvatarFallback>A</AvatarFallback>
            </Avatar>
          </Link>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-medium text-sidebar-foreground">Profile</span>
          <span className="block text-[0.6875rem] text-sidebar-foreground/75">
            Account &amp; sign out
          </span>
        </span>
      </div>
    </div>
  );
}

type ProductShellProps = {
  children: React.ReactNode;
  variant?: ShellVariant;
  credits?: number;
  creditLabel?: string;
  suspended?: boolean;
};

function ProductShellFallback({ variant }: { variant: ShellVariant }) {
  return (
    <div
      role="status"
      aria-label={variant === "admin" ? "Loading admin workspace" : "Loading writing studio"}
      className="min-h-dvh bg-background text-foreground [&_.text-primary]:text-[#5130b8] dark:[&_.text-primary]:text-[#b5aaff] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <span className="sr-only">
        {variant === "admin" ? "Loading admin workspace" : "Loading writing studio"}
      </span>
      <aside className="hidden border-r border-sidebar-border bg-sidebar px-4 py-5 lg:block">
        <BrandMark className="text-sidebar-foreground" />
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center border-b border-border px-4 lg:hidden">
          <BrandMark />
        </header>
        <div className="mx-auto w-full max-w-[92rem] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
          <div className="h-3 w-28 bg-muted" />
          <div className="h-10 w-full max-w-xl bg-muted" />
          <div className="h-72 w-full border border-border bg-card" />
        </div>
      </div>
    </div>
  );
}

export function ProductShell({
  children,
  variant = "studio",
  credits,
  creditLabel,
  suspended = false,
}: ProductShellProps) {
  return (
    <StudioSuspensionProvider suspended={suspended}>
      <AuthoringJourneyCommandProvider>
        <React.Suspense fallback={<ProductShellFallback variant={variant} />}>
          <ProductShellWithPathname
            variant={variant}
            credits={credits}
            creditLabel={creditLabel}
            suspended={suspended}
          >
            {children}
          </ProductShellWithPathname>
        </React.Suspense>
      </AuthoringJourneyCommandProvider>
    </StudioSuspensionProvider>
  );
}

function ProductShellWithPathname({
  children,
  variant = "studio",
  credits,
  creditLabel,
  suspended = false,
}: ProductShellProps) {
  const pathname = usePathname() ?? (variant === "admin" ? "/admin" : "/studio");
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const { nextAction } = useAuthoringJourneyCommand();
  const [seenCoachmarks, setSeenCoachmarks] = React.useState<string[] | null>(null);
  const editorOwnsMobileChrome =
    variant === "studio" && /^\/projects\/[^/]+\/editor\/\d+\/?$/.test(pathname);

  const openHelp = React.useCallback(() => {
    setMobileNavOpen(false);
    setCommandPaletteOpen(false);
    setHelpOpen(true);
  }, []);

  React.useEffect(() => {
    if (variant !== "studio") return;
    const controller = new AbortController();
    void fetch("/api/onboarding?preferences=1", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const preferences = (await response.json()) as AuthoringOnboardingPreferences;
        setSeenCoachmarks(preferences.seenCoachmarks);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [variant]);

  const markCoachmarkSeen = React.useCallback((coachmark: string) => {
    setSeenCoachmarks((current) =>
      current && !current.includes(coachmark) ? [...current, coachmark] : current,
    );
    void fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_coachmark_seen", coachmark }),
    }).catch(() => {});
  }, []);

  const showMobileNavigationCoachmark =
    seenCoachmarks !== null && !seenCoachmarks.includes("mobile_navigation");

  return (
    <StudioHelpProvider
      onOpen={openHelp}
      seenCoachmarks={seenCoachmarks}
      onCoachmarkSeen={markCoachmarkSeen}
    >
      <div className="min-h-dvh min-w-0 bg-background text-foreground [&_.text-primary]:text-[#5130b8] dark:[&_.text-primary]:text-[#b5aaff] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          aria-label={
            variant === "admin" ? "Admin navigation and account" : "Studio navigation and account"
          }
          className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex"
        >
          <ProductMark variant={variant} />
          {variant === "studio" ? (
            <div className="mt-6">
              <CommandButton onOpen={() => setCommandPaletteOpen(true)} />
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-2 border-y border-sidebar-border py-3 font-mono text-[0.6875rem] tracking-[0.12em] text-sidebar-foreground/75 uppercase">
              <ShieldCheck aria-hidden="true" className="size-3.5 text-ember" />
              Restricted access
            </div>
          )}
          <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
            <Navigation
              variant={variant}
              pathname={pathname}
              credits={credits}
              creditLabel={creditLabel}
            />
          </div>
          <div className="border-t border-sidebar-border pt-4">
            <ShellUtilities variant={variant} onOpenHelp={openHelp} />
          </div>
        </aside>

        <div className="min-w-0">
          {editorOwnsMobileChrome ? null : (
            <header className="sticky top-0 z-40 grid min-h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] supports-[backdrop-filter]:backdrop-blur-md lg:hidden">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      onClick={() => setMobileNavOpen(true)}
                      aria-label={
                        variant === "admin" ? "Open admin navigation" : "Open studio navigation"
                      }
                      className="rounded-sm"
                    />
                  }
                >
                  <Menu aria-hidden="true" />
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[min(22rem,88vw)] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
                >
                  <SheetHeader className="border-b border-sidebar-border p-5 text-left">
                    <SheetTitle className="sr-only">
                      {variant === "admin" ? "Admin navigation" : "Studio navigation"}
                    </SheetTitle>
                    <SheetDescription className="sr-only">
                      Choose a destination in sopher.ai.
                    </SheetDescription>
                    <ProductMark variant={variant} />
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {variant === "studio" && showMobileNavigationCoachmark ? (
                      <div className="mb-5">
                        <StudioCoachmark
                          title="Everything is still within reach"
                          onDismiss={() => markCoachmarkSeen("mobile_navigation")}
                        >
                          Your books, credits, settings, and Help live in this menu while you write
                          on a smaller screen.
                        </StudioCoachmark>
                      </div>
                    ) : null}
                    {variant === "studio" ? (
                      <div className="mb-6">
                        <CommandButton onOpen={() => setCommandPaletteOpen(true)} />
                      </div>
                    ) : null}
                    <Navigation
                      variant={variant}
                      pathname={pathname}
                      mobile
                      credits={credits}
                      creditLabel={creditLabel}
                    />
                  </div>
                  <div className="p-4">
                    <ShellUtilities variant={variant} mobile onOpenHelp={openHelp} />
                  </div>
                </SheetContent>
              </Sheet>

              <span className="min-w-0 justify-self-center overflow-hidden">
                <ProductMark variant={variant} showContext={false} />
              </span>
              <div className="flex items-center justify-self-end gap-1">
                {variant === "studio" ? (
                  <CommandButton compact onOpen={() => setCommandPaletteOpen(true)} />
                ) : (
                  <ThemeToggle />
                )}
              </div>
            </header>
          )}

          <main
            id="main-content"
            tabIndex={-1}
            className="safe-area-page min-h-[calc(100dvh-3.5rem)] min-w-0 pt-6 sm:pt-8 lg:min-h-dvh"
          >
            <div className="mx-auto w-full max-w-[92rem] min-w-0">
              {variant === "studio" && suspended ? (
                <section
                  aria-labelledby="account-suspension-title"
                  className="mx-4 mb-5 border-y border-destructive/35 bg-destructive/5 py-3 sm:mx-6 lg:mx-8"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <p id="account-suspension-title" className="text-sm font-semibold">
                        Account access is limited
                      </p>
                      <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">
                        {SUSPENDED_AUTHORING_MESSAGE}
                      </p>
                    </div>
                    <a
                      href="mailto:support@sopher.ai?subject=Suspended%20account%20help"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Contact support
                    </a>
                  </div>
                </section>
              ) : null}
              {children}
            </div>
          </main>
        </div>

        {variant === "studio" ? (
          <>
            <CommandPalette
              open={commandPaletteOpen}
              onOpenChange={setCommandPaletteOpen}
              onOpenHelp={openHelp}
              nextAction={nextAction}
            />
            <StudioHelp open={helpOpen} onOpenChange={setHelpOpen} pathname={pathname} />
          </>
        ) : null}
      </div>
    </StudioHelpProvider>
  );
}
