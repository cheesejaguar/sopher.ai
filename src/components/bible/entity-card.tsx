"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, Loader2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BibleEntity } from "@/db/queries/entities";
import { PORTRAIT_USD, PORTRAIT_KINDS } from "@/lib/bible/portraits";
import { creditsForUsd } from "@/lib/billing/credits-shared";
import { setContinuityIssueStatus } from "@/lib/actions/continuity";
import { cn } from "@/lib/utils";

type Conflict = { id: string; severity: string; description: string };

/** Attribute keys rendered as prose lines, in the order a reader wants them. */
const FIELD_ORDER = [
  "role",
  "occupation",
  "age",
  "heritage",
  "appearance",
  "speech",
  "locationType",
  "description",
  "owner",
  "atmosphere",
  "significance",
  "provenance",
  "holder",
  "purpose",
  "structure",
  "reputation",
  "when",
  "outcome",
  "nameRationale",
];

const FIELD_LABELS: Record<string, string> = {
  role: "Role",
  occupation: "Occupation",
  age: "Age",
  heritage: "Heritage",
  appearance: "Appearance",
  speech: "Speech",
  locationType: "Type",
  description: "Description",
  owner: "Owner",
  atmosphere: "Atmosphere",
  significance: "Significance",
  provenance: "Provenance",
  holder: "Held by",
  purpose: "Purpose",
  structure: "Structure",
  reputation: "Reputation",
  when: "When",
  outcome: "Outcome",
  nameRationale: "Why this name",
};

const LIST_FIELDS = [
  "personality",
  "goals",
  "secrets",
  "features",
  "contents",
  "capabilities",
  "members",
  "participants",
];

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function EntityCard({ entity, conflicts }: { entity: BibleEntity; conflicts: Conflict[] }) {
  const router = useRouter();
  const [portraitUrl, setPortraitUrl] = useState(entity.portraitUrl);
  const [busy, setBusy] = useState(false);
  const [busyIssue, setBusyIssue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);

  async function settleIssue(issueId: string, status: "resolved" | "dismissed") {
    setBusyIssue(issueId);
    setIssueError(null);
    try {
      await setContinuityIssueStatus(issueId, status);
      router.refresh();
    } catch {
      setIssueError("Could not update this conflict. Nothing changed — try again.");
    } finally {
      setBusyIssue(null);
    }
  }

  const attrs = entity.attrs as Record<string, unknown>;
  const facts = asList(attrs.facts);
  const canHavePortrait = PORTRAIT_KINDS.includes(entity.kind);

  async function generatePortrait() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/entities/${entity.id}/portrait`, { method: "POST" });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(body.error ?? "Could not generate a portrait");
        return;
      }
      setPortraitUrl(body.url);
    } catch {
      setError("Could not generate a portrait");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="instrument-surface flex h-full flex-col gap-3 rounded-sm p-4">
      <div className="flex items-start gap-3">
        {portraitUrl ? (
          <Image
            src={portraitUrl}
            alt={`Impression of ${entity.name}`}
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-md object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h4 className="font-sans font-semibold break-words">{entity.name}</h4>
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
          <Badge variant="destructive" className="shrink-0 gap-1">
            <TriangleAlert aria-hidden="true" className="size-3" />
            {conflicts.length}
          </Badge>
        ) : null}
      </div>

      <dl className="space-y-1 text-sm">
        {FIELD_ORDER.map((field) => {
          const value = asText(attrs[field]);
          if (!value) return null;
          return (
            <div key={field} className="flex gap-2">
              <dt className="shrink-0 text-xs text-muted-foreground">{FIELD_LABELS[field]}</dt>
              <dd className="min-w-0 text-pretty">{value}</dd>
            </div>
          );
        })}
        {LIST_FIELDS.map((field) => {
          const values = asList(attrs[field]);
          if (values.length === 0) return null;
          return (
            <div key={field} className="flex gap-2">
              <dt className="shrink-0 text-xs text-muted-foreground capitalize">{field}</dt>
              <dd className="min-w-0 text-pretty">{values.join(", ")}</dd>
            </div>
          );
        })}
      </dl>

      {entity.relationships.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {entity.relationships.map((rel, i) => (
            <li key={`${rel.type}-${rel.other}-${i}`}>
              <Badge variant="secondary" className="font-normal">
                {rel.type.replace(/-/g, " ")} {rel.other}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {facts.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
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
                  disabled={busyIssue !== null}
                  onClick={() => settleIssue(c.id, "resolved")}
                  className="min-h-11 rounded-sm border border-destructive/40 px-2 font-sans font-medium hover:bg-destructive/10 disabled:opacity-50 sm:min-h-9"
                >
                  {busyIssue === c.id ? "…" : "Mark resolved"}
                </button>
                <button
                  type="button"
                  disabled={busyIssue !== null}
                  onClick={() => settleIssue(c.id, "dismissed")}
                  className="min-h-11 rounded-sm px-2 font-sans text-muted-foreground hover:text-foreground disabled:opacity-50 sm:min-h-9"
                >
                  Dismiss
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
        <div className="mt-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generatePortrait}
            disabled={busy}
            className="w-full"
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <ImagePlus aria-hidden="true" className="size-3.5" />
            )}
            {busy
              ? "Generating…"
              : `Generate portrait · ${creditsForUsd(PORTRAIT_USD).toFixed(1)} credits`}
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
    </article>
  );
}
