"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * ⌘K navigation. Global destinations always; project stages appear when the
 * current URL is inside a project. Actions stay in their own surfaces — the
 * palette only ever navigates, so it can never surprise.
 */
/** usePathname must sit under Suspense with cacheComponents (see stage-nav). */
export function CommandPalette() {
  return (
    <Suspense fallback={null}>
      <CommandPaletteInner />
    </Suspense>
  );
}

function CommandPaletteInner() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("sopher:open-command-palette", onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("sopher:open-command-palette", onOpenRequest);
    };
  }, []);

  const projectMatch = pathname?.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  function go(href: string) {
    setOpen(false);
    router.push(href as Route);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="Jump anywhere">
      <CommandInput aria-label="Search destinations" placeholder="Where to?" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Studio">
          <CommandItem onSelect={() => go("/studio")}>Your books</CommandItem>
          <CommandItem onSelect={() => go("/studio/new")}>Start a new book</CommandItem>
          <CommandItem onSelect={() => go("/studio/credits")}>Credits</CommandItem>
          <CommandItem onSelect={() => go("/studio/usage")}>Usage</CommandItem>
          <CommandItem onSelect={() => go("/studio/settings")}>Settings</CommandItem>
        </CommandGroup>
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
