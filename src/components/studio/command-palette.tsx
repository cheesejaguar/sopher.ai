"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import type { AuthoringNextAction } from "@/lib/authoring-journey";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { isCurrentPageCancellationAction } from "@/components/studio/project-next-step";

/**
 * ⌘K navigation. Global destinations always; project stages appear when the
 * current URL is inside a project. Actions stay in their own surfaces — the
 * palette only ever navigates, so it can never surprise.
 */
/** usePathname must sit under Suspense with cacheComponents (see stage-nav). */
type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenHelp?: () => void;
  nextAction?: AuthoringNextAction | null;
};

export function CommandPalette({
  open,
  onOpenChange,
  onOpenHelp,
  nextAction,
}: CommandPaletteProps) {
  return (
    <Suspense fallback={null}>
      <CommandPaletteInner
        open={open}
        onOpenChange={onOpenChange}
        onOpenHelp={onOpenHelp}
        nextAction={nextAction}
      />
    </Suspense>
  );
}

function CommandPaletteInner({ open, onOpenChange, onOpenHelp, nextAction }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  const projectMatch = pathname?.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];
  const currentPageCancellation = nextAction
    ? isCurrentPageCancellationAction(nextAction, pathname)
    : false;

  function go(href: string) {
    onOpenChange(false);
    if (!href.startsWith("/")) {
      window.location.assign(href);
      return;
    }
    router.push(href as Route);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go to"
      description="Jump anywhere"
    >
      <CommandInput aria-label="Search destinations" placeholder="Where to?" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Studio">
          <CommandItem onSelect={() => go("/studio")}>Your books</CommandItem>
          <CommandItem onSelect={() => go("/studio/new")}>Start a new book</CommandItem>
          <CommandItem onSelect={() => go("/studio/credits")}>Credits</CommandItem>
          <CommandItem onSelect={() => go("/studio/usage")}>Usage</CommandItem>
          <CommandItem onSelect={() => go("/studio/settings")}>Settings</CommandItem>
          {onOpenHelp ? (
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                onOpenHelp();
              }}
            >
              Help and support
            </CommandItem>
          ) : null}
        </CommandGroup>
        {projectId && nextAction ? (
          <CommandGroup heading="Next step">
            {currentPageCancellation ? (
              <CommandItem disabled>Status: Stopping safely</CommandItem>
            ) : (
              <CommandItem onSelect={() => go(nextAction.href)}>
                Next: {nextAction.label}
              </CommandItem>
            )}
          </CommandGroup>
        ) : null}
        {projectId ? (
          <CommandGroup heading="Plan">
            <CommandItem onSelect={() => go(`/projects/${projectId}/brief`)}>Brief</CommandItem>
            <CommandItem onSelect={() => go(`/projects/${projectId}/outline`)}>Outline</CommandItem>
          </CommandGroup>
        ) : null}
        {projectId ? (
          <CommandGroup heading="Produce">
            <CommandItem onSelect={() => go(`/projects/${projectId}/bible`)}>
              Story bible
            </CommandItem>
            <CommandItem onSelect={() => go(`/projects/${projectId}/write`)}>Write</CommandItem>
          </CommandGroup>
        ) : null}
        {projectId ? (
          <CommandGroup heading="Refine">
            <CommandItem onSelect={() => go(`/projects/${projectId}/editor`)}>Editor</CommandItem>
          </CommandGroup>
        ) : null}
        {projectId ? (
          <CommandGroup heading="Publish">
            <CommandItem onSelect={() => go(`/projects/${projectId}/manuscript`)}>
              Manuscript
            </CommandItem>
          </CommandGroup>
        ) : null}
        {projectId ? (
          <CommandGroup heading="Project">
            <CommandItem onSelect={() => go(`/projects/${projectId}/usage`)}>Usage</CommandItem>
            <CommandItem onSelect={() => go(`/projects/${projectId}/settings`)}>
              Project settings
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
