"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { acknowledgePaidResponse, idempotentPaidFetch } from "@/lib/client/idempotent-paid-fetch";
import {
  SUSPENDED_AUTHORING_MESSAGE,
  useStudioSuspension,
} from "@/components/studio/studio-access-context";
import {
  COVER_LAYOUTS,
  COVER_LAYOUT_IDS,
  COVER_PALETTES,
  COVER_PALETTE_IDS,
  DEFAULT_COVER_PALETTE,
  type CoverLayoutId,
  type CoverPaletteId,
} from "@/lib/cover/compose";

/** Generates (or replaces) the book cover. Priced per image, on demand only. */
export function CoverButton({ projectId, hasCover }: { projectId: string; hasCover: boolean }) {
  const router = useRouter();
  const suspended = useStudioSuspension();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (suspended) return;
    setBusy(true);
    setError(null);
    try {
      const response = await idempotentPaidFetch(`/api/projects/${projectId}/cover`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not generate a cover");
        return;
      }
      router.refresh();
      acknowledgePaidResponse(response);
    } catch {
      setError("Could not generate a cover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" onClick={generate} disabled={busy || suspended}>
          {busy ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <ImagePlus aria-hidden="true" className="size-3.5" />
          )}
          {busy
            ? "Painting…"
            : hasCover
              ? "New cover · 0.2 credits"
              : "Generate cover · 0.2 credits"}
        </Button>
        {hasCover ? <LetteringMenu projectId={projectId} /> : null}
      </div>
      <span className="sr-only">Cover generation meters approximately $0.067.</span>
      {suspended ? (
        <p className="max-w-xs text-xs text-muted-foreground">{SUSPENDED_AUTHORING_MESSAGE}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Re-letters the cover the author already paid for. Free, so it stays enabled
 * for suspended accounts — the suspension covers AI work and purchases, and
 * this is neither.
 */
function LetteringMenu({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<CoverLayoutId | null>(null);
  const [palette, setPalette] = useState<CoverPaletteId>(DEFAULT_COVER_PALETTE);
  const inFlight = useRef(false);

  async function loadCurrent(open: boolean) {
    if (!open || layout) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/cover/compose`);
      if (!response.ok) return;
      const body = (await response.json()) as {
        layout?: CoverLayoutId | null;
        palette?: CoverPaletteId | null;
      };
      if (body.layout) setLayout(body.layout);
      if (body.palette) setPalette(body.palette);
    } catch {
      // The menu still works without knowing which arrangement is current.
    }
  }

  async function apply(next: { layout: CoverLayoutId; palette: CoverPaletteId }) {
    // The menu stays open so several arrangements can be tried in a row; one
    // request at a time keeps those tries from racing each other's writes.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/cover/compose`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not change the lettering");
        return;
      }
      setLayout(next.layout);
      setPalette(next.palette);
      router.refresh();
    } catch {
      setError("Could not change the lettering");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu onOpenChange={loadCurrent}>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          {busy ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <Type aria-hidden="true" className="size-3.5" />
          )}
          {busy ? "Setting type…" : "Lettering · free"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="max-w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="folio-label">Title layout</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={layout ?? ""}
              onValueChange={(value) => apply({ layout: value as CoverLayoutId, palette })}
            >
              {COVER_LAYOUT_IDS.map((id) => (
                <DropdownMenuRadioItem key={id} value={id} closeOnClick={false}>
                  <span className="flex flex-col items-start">
                    {COVER_LAYOUTS[id].label}
                    <span className="text-xs text-muted-foreground">
                      {COVER_LAYOUTS[id].description}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="folio-label">Type colour</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={palette}
              onValueChange={(value) =>
                apply({ layout: layout ?? COVER_LAYOUT_IDS[0], palette: value as CoverPaletteId })
              }
            >
              {COVER_PALETTE_IDS.map((id) => (
                <DropdownMenuRadioItem key={id} value={id} closeOnClick={false}>
                  {COVER_PALETTES[id].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
