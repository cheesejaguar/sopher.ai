"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Expand, ImagePlus, Loader2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BibleEntity } from "@/db/queries/entities";
import { PORTRAIT_USD, PORTRAIT_KINDS } from "@/lib/bible/portraits";
import { acknowledgePaidResponse, idempotentPaidFetch } from "@/lib/client/idempotent-paid-fetch";
import { creditsForUsd } from "@/lib/billing/credits-shared";
import { setContinuityIssueStatus } from "@/lib/actions/continuity";
import { cn } from "@/lib/utils";

type Conflict = { id: string; severity: string; description: string };

type ProfileField = { key: string; label: string; list?: true };
type ProfileSection = { title: string; fields: ProfileField[] };
type GeneratedImageCopy = {
  action: string;
  pending: string;
  ready: string;
  failure: string;
};

const GENERATED_IMAGE_COPY: Record<BibleEntity["kind"], GeneratedImageCopy> = {
  character: {
    action: "Generate portrait",
    pending: "Generating portrait",
    ready: "Portrait ready",
    failure: "Could not generate a portrait",
  },
  location: {
    action: "Generate location image",
    pending: "Generating location image",
    ready: "Location image ready",
    failure: "Could not generate a location image",
  },
  object: {
    action: "Generate object illustration",
    pending: "Generating object illustration",
    ready: "Object illustration ready",
    failure: "Could not generate an object illustration",
  },
  organization: {
    action: "Generate organization illustration",
    pending: "Generating organization illustration",
    ready: "Organization illustration ready",
    failure: "Could not generate an organization illustration",
  },
  event: {
    action: "Generate event illustration",
    pending: "Generating event illustration",
    ready: "Event illustration ready",
    failure: "Could not generate an event illustration",
  },
};

const PROFILE_SECTIONS: Record<BibleEntity["kind"], ProfileSection[]> = {
  character: [
    {
      title: "Place in the story",
      fields: [
        { key: "role", label: "Role" },
        { key: "background", label: "Background" },
        { key: "occupation", label: "Occupation" },
        { key: "age", label: "Age" },
        { key: "heritage", label: "Heritage" },
        { key: "arc", label: "Character arc" },
        { key: "nameRationale", label: "Why this name" },
      ],
    },
    {
      title: "Physical canon",
      fields: [
        { key: "appearance", label: "Overall appearance" },
        { key: "build", label: "Build and movement" },
        { key: "face", label: "Face" },
        { key: "hair", label: "Hair" },
        { key: "eyes", label: "Eyes" },
        { key: "complexion", label: "Complexion" },
        { key: "distinguishingFeatures", label: "Distinguishing features", list: true },
        { key: "wardrobe", label: "Wardrobe and accessories" },
        { key: "posture", label: "Posture" },
      ],
    },
    {
      title: "Voice and inner life",
      fields: [
        { key: "speech", label: "Speech" },
        { key: "personality", label: "Personality", list: true },
        { key: "mannerisms", label: "Mannerisms", list: true },
        { key: "goals", label: "Goals", list: true },
        { key: "fears", label: "Fears", list: true },
        { key: "secrets", label: "Secrets", list: true },
      ],
    },
  ],
  location: [
    {
      title: "Place profile",
      fields: [
        { key: "locationType", label: "Type" },
        { key: "description", label: "Description" },
        { key: "features", label: "Fixed features", list: true },
        { key: "contents", label: "Contents", list: true },
        { key: "atmosphere", label: "Atmosphere" },
        { key: "owner", label: "Owner" },
      ],
    },
  ],
  object: [
    {
      title: "Object profile",
      fields: [
        { key: "description", label: "Description" },
        { key: "significance", label: "Significance" },
        { key: "provenance", label: "Origin" },
        { key: "holder", label: "Held by" },
        { key: "capabilities", label: "Capabilities", list: true },
      ],
    },
  ],
  organization: [
    {
      title: "Organization profile",
      fields: [
        { key: "purpose", label: "Purpose" },
        { key: "structure", label: "Structure" },
        { key: "members", label: "Members", list: true },
        { key: "reputation", label: "Reputation" },
      ],
    },
  ],
  event: [
    {
      title: "Event profile",
      fields: [
        { key: "when", label: "When" },
        { key: "participants", label: "Participants", list: true },
        { key: "outcome", label: "Outcome" },
        { key: "significance", label: "Significance" },
      ],
    },
  ],
};

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function visualCanonSummary(
  kind: BibleEntity["kind"],
  attrs: Record<string, unknown>,
): string | null {
  const values =
    kind === "character"
      ? [
          asText(attrs.appearance),
          asText(attrs.build),
          asText(attrs.face),
          asText(attrs.hair),
          asText(attrs.eyes),
          asText(attrs.complexion),
          ...asList(attrs.distinguishingFeatures),
          asText(attrs.wardrobe),
          asText(attrs.posture),
        ]
      : kind === "location"
        ? [
            asText(attrs.description),
            ...asList(attrs.features),
            asText(attrs.atmosphere),
            ...asList(attrs.contents),
          ]
        : kind === "object"
          ? [asText(attrs.description), asText(attrs.provenance), ...asList(attrs.capabilities)]
          : [];
  const summary = values.filter((value): value is string => Boolean(value)).join(". ");
  return summary || null;
}

export function EntityCard({ entity, conflicts }: { entity: BibleEntity; conflicts: Conflict[] }) {
  const router = useRouter();
  const [portraitUrl, setPortraitUrl] = useState(entity.portraitUrl);
  const [busy, setBusy] = useState(false);
  const [busyIssue, setBusyIssue] = useState<{
    id: string;
    status: "resolved" | "dismissed";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [activityStatus, setActivityStatus] = useState("");
  const portraitTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cardHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusPortraitWhenReadyRef = useRef(false);

  useEffect(() => {
    if (!portraitUrl || !focusPortraitWhenReadyRef.current) return;
    focusPortraitWhenReadyRef.current = false;
    portraitTriggerRef.current?.focus();
  }, [portraitUrl]);

  async function settleIssue(issueId: string, status: "resolved" | "dismissed") {
    if (busyIssue) return;
    setBusyIssue({ id: issueId, status });
    setIssueError(null);
    setActivityStatus(
      status === "resolved" ? "Marking conflict as resolved…" : "Dismissing conflict…",
    );
    try {
      await setContinuityIssueStatus(issueId, status);
      setActivityStatus(
        status === "resolved"
          ? `Conflict marked resolved for ${entity.name}.`
          : `Conflict dismissed for ${entity.name}.`,
      );
      cardHeadingRef.current?.focus();
      router.refresh();
    } catch {
      setIssueError("Could not update this conflict. Nothing changed — try again.");
      setActivityStatus("");
    } finally {
      setBusyIssue(null);
    }
  }

  const attrs = entity.attrs as Record<string, unknown>;
  const facts = asList(attrs.facts);
  const visualSummary = visualCanonSummary(entity.kind, attrs);
  const generatedImageCopy = GENERATED_IMAGE_COPY[entity.kind];
  const canHavePortrait = PORTRAIT_KINDS.includes(entity.kind);
  const populatedSections = PROFILE_SECTIONS[entity.kind]
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) =>
        field.list ? asList(attrs[field.key]).length > 0 : Boolean(asText(attrs[field.key])),
      ),
    }))
    .filter((section) => section.fields.length > 0);

  async function generatePortrait() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setActivityStatus(`${generatedImageCopy.pending} for ${entity.name}…`);
    try {
      const response = await idempotentPaidFetch(`/api/entities/${entity.id}/portrait`, {
        method: "POST",
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(body.error ?? generatedImageCopy.failure);
        setActivityStatus("");
        return;
      }
      focusPortraitWhenReadyRef.current = true;
      setPortraitUrl(body.url);
      setActivityStatus(
        `${generatedImageCopy.ready} for ${entity.name}. Open the full image to inspect it.`,
      );
      acknowledgePaidResponse(response);
    } catch {
      setError(generatedImageCopy.failure);
      setActivityStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      aria-busy={busy || busyIssue !== null}
      aria-labelledby={`entity-${entity.id}`}
      className="instrument-surface flex h-full flex-col overflow-hidden rounded-sm"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {activityStatus}
      </p>
      {portraitUrl ? (
        <Dialog>
          <DialogTrigger
            render={
              <button
                ref={portraitTriggerRef}
                type="button"
                className="group relative block min-h-44 w-full overflow-hidden border-b border-border bg-muted text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
                aria-label={`View full image of ${entity.name}`}
              />
            }
          >
            <span className="relative block aspect-[4/3] min-h-44 w-full">
              <Image
                src={portraitUrl}
                alt=""
                fill
                sizes="(min-width: 1536px) 28vw, (min-width: 640px) 45vw, 100vw"
                className="object-cover transition duration-300 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
              />
              <span className="absolute right-3 bottom-3 flex min-h-11 items-center gap-2 rounded-sm border border-white/20 bg-black/75 px-3 text-xs font-medium text-white shadow-[0_8px_24px_-12px_rgb(0_0_0/85%)]">
                <Expand aria-hidden="true" className="size-4" />
                View full image
              </span>
            </span>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-3 sm:max-w-5xl">
            <DialogHeader className="pr-12">
              <DialogTitle>{entity.name}</DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">
                  Full illustration generated from this entry&apos;s visual canon.
                </span>
                {visualSummary ? (
                  <span className="block">Visual canon: {visualSummary}</span>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <div className="relative h-[min(70dvh,calc(100vw-3.5rem))] min-h-32 w-full overflow-hidden bg-black/45">
              <Image src={portraitUrl} alt="" fill sizes="90vw" className="object-contain" />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <div className="flex flex-1 flex-col gap-5 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h4
              ref={cardHeadingRef}
              id={`entity-${entity.id}`}
              tabIndex={-1}
              className="font-sans font-semibold break-words focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {entity.name}
            </h4>
            {entity.aliases.length > 0 ? (
              <p className="text-xs text-muted-foreground">also {entity.aliases.join(", ")}</p>
            ) : null}
            {entity.firstAppearanceChapter ? (
              <p className="mt-0.5 font-mono text-[0.68rem] text-muted-foreground">
                first appears ch. {entity.firstAppearanceChapter}
              </p>
            ) : null}
          </div>
          {conflicts.length > 0 ? (
            <Badge
              variant="destructive"
              className="shrink-0 gap-1"
              aria-label={`${conflicts.length} open ${conflicts.length === 1 ? "conflict" : "conflicts"}`}
            >
              <TriangleAlert aria-hidden="true" className="size-3" />
              {conflicts.length} {conflicts.length === 1 ? "conflict" : "conflicts"}
            </Badge>
          ) : null}
        </div>

        {populatedSections.map((section) => (
          <section key={section.title} className="space-y-2 border-t border-border pt-3">
            <h5 className="text-sm font-semibold">{section.title}</h5>
            <dl className="space-y-2.5 text-sm">
              {section.fields.map((field) => {
                const values = field.list ? asList(attrs[field.key]) : [];
                const value = field.list ? null : asText(attrs[field.key]);
                return (
                  <div key={field.key} className="grid gap-0.5 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                    <dt className="text-xs leading-5 text-muted-foreground">{field.label}</dt>
                    <dd className="min-w-0 text-pretty">
                      {field.list ? values.join(" · ") : value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}

        {entity.relationships.length > 0 ? (
          <section className="space-y-2 border-t border-border pt-3">
            <h5 className="text-sm font-semibold">Relationships</h5>
            <ul className="divide-y divide-border">
              {entity.relationships.map((rel, i) => (
                <li key={`${rel.type}-${rel.other}-${i}`} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium">
                    {rel.other}
                    <span className="ml-2 font-mono text-[0.68rem] font-normal tracking-wide text-muted-foreground">
                      {rel.type.replace(/-/g, " ")}
                    </span>
                  </p>
                  {rel.description ? (
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {rel.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {facts.length > 0 ? (
          <details className="border-t border-border pt-3 text-sm">
            <summary className="min-h-11 cursor-pointer content-center text-xs text-muted-foreground hover:text-foreground">
              {facts.length} established {facts.length === 1 ? "fact" : "facts"}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-pretty">
              {facts.map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
          </details>
        ) : null}

        {conflicts.length > 0 ? (
          <ul className="space-y-2 rounded-sm border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {conflicts.map((c) => (
              <li key={c.id} className="space-y-1">
                <p>{c.description}</p>
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    aria-busy={
                      busyIssue?.id === c.id && busyIssue.status === "resolved" ? true : undefined
                    }
                    aria-disabled={busyIssue !== null}
                    onClick={() => settleIssue(c.id, "resolved")}
                    className="min-h-11 rounded-sm border border-destructive/40 px-2 font-sans font-medium hover:bg-destructive/10 aria-disabled:opacity-50 sm:min-h-9"
                  >
                    {busyIssue?.id === c.id && busyIssue.status === "resolved"
                      ? "Marking resolved…"
                      : "Mark resolved"}
                  </button>
                  <button
                    type="button"
                    aria-busy={
                      busyIssue?.id === c.id && busyIssue.status === "dismissed" ? true : undefined
                    }
                    aria-disabled={busyIssue !== null}
                    onClick={() => settleIssue(c.id, "dismissed")}
                    className="min-h-11 rounded-sm px-2 font-sans text-muted-foreground hover:text-foreground aria-disabled:opacity-50 sm:min-h-9"
                  >
                    {busyIssue?.id === c.id && busyIssue.status === "dismissed"
                      ? "Dismissing…"
                      : "Dismiss"}
                  </button>
                </span>
              </li>
            ))}
            {issueError ? (
              <li role="alert" className="border-t border-destructive/30 pt-2">
                {issueError}
              </li>
            ) : null}
          </ul>
        ) : null}

        {canHavePortrait && !portraitUrl ? (
          <div className="mt-auto border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generatePortrait}
              aria-busy={busy || undefined}
              aria-disabled={busy}
              className={cn("w-full", busy && "opacity-50")}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <ImagePlus aria-hidden="true" className="size-3.5" />
              )}
              {busy
                ? "Generating…"
                : `${generatedImageCopy.action} · ${creditsForUsd(PORTRAIT_USD).toFixed(1)} credits`}
            </Button>
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              ${PORTRAIT_USD.toFixed(3)} metered image cost
            </p>
            {error ? (
              <p role="alert" className={cn("mt-1 text-xs text-destructive")}>
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
