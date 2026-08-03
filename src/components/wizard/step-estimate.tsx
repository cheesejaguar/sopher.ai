"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { MODELS, QUALITY_TIERS, TIER_LABELS, type QualityTier } from "@/ai/models";
import type { BookEstimate } from "@/ai/estimate";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { WizardActionEvent, WizardState } from "@/components/wizard/wizard-state";

const TIERS = QUALITY_TIERS;

const MODEL_NAMES: Record<string, string> = {
  "anthropic/claude-haiku-4.5": "Haiku",
  "anthropic/claude-sonnet-5": "Sonnet",
  "anthropic/claude-opus-5": "Opus",
};

function modelName(slug: string): string {
  return MODEL_NAMES[slug] ?? slug.split("/").pop() ?? slug;
}

/** The tier's model mix, in plain words. */
function modelMix(tier: QualityTier): string {
  const m = MODELS[tier];
  const parts = [`${modelName(m.prose)} writes`];
  if (tier !== "draft") parts.push(`${modelName(m.editor)} edits`);
  parts.push(`${modelName(m.planner)} plans`);
  return parts.join(" · ");
}

function formatCredits(value: number): string {
  return `${value.toFixed(1)} cr`;
}

/** What the wallet is actually debited: metered USD at retail markup. */
type QuotedEstimate = BookEstimate & { credits: number; balance: number | null };

type EstimateMap = Partial<Record<QualityTier, QuotedEstimate>>;
type QuoteError = { shapeKey: string; message: string };

export type WizardQuoteSummary = {
  credits: number;
  balance: number | null;
  covered: boolean | null;
  label?: string;
  chapters: number;
  wordsPerChapter: number;
  tier: QualityTier;
};

export function StepEstimate({
  state,
  dispatch,
  onQuote,
  experience = "full_book",
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardActionEvent>;
  onQuote?: (quote: WizardQuoteSummary | null) => void;
  experience?: "trial_short_story" | "full_book";
}) {
  const [estimates, setEstimates] = React.useState<EstimateMap>({});
  const [quotedShape, setQuotedShape] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [quoteError, setQuoteError] = React.useState<QuoteError | null>(null);
  const [quoteRevision, retryQuote] = React.useReducer((value: number) => value + 1, 0);

  const { chapters, wordsPerChapter } = state;
  const shapeKey = `${chapters}:${wordsPerChapter}`;

  // Debounced re-quote whenever the book's shape changes.
  React.useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setQuoteError(null);
      try {
        // One request for all three tiers. This used to fan out to three
        // parallel requests, each repeating the same per-user balance query.
        const res = await fetch("/api/estimates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapters, wordsPerChapter }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
          throw new Error(
            typeof body?.error === "string" ? body.error : "The estimate could not be refreshed.",
          );
        }
        const body = (await res.json()) as { tiers: QuotedEstimate[] };
        const next: EstimateMap = {};
        for (const estimate of body.tiers ?? []) {
          next[estimate.tier] = estimate;
        }
        setEstimates(next);
        setQuotedShape(shapeKey);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setQuoteError({
          shapeKey,
          message:
            cause instanceof Error && cause.message
              ? cause.message
              : "The estimate could not be refreshed. Check your connection and try again.",
        });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [chapters, quoteRevision, shapeKey, wordsPerChapter]);

  const selected = quotedShape === shapeKey ? estimates[state.tier] : undefined;
  const currentQuoteError = quoteError?.shapeKey === shapeKey ? quoteError.message : null;
  const quotePending = loading || (quotedShape !== shapeKey && currentQuoteError === null);
  const balance = selected?.balance ?? null;
  const short = selected !== undefined && balance !== null && balance < selected.credits;

  // Announced once the quote has settled — never while it is still being fetched,
  // and never per keystroke (the quote itself is debounced).
  const announcement =
    selected && !quotePending
      ? experience === "trial_short_story"
        ? `Included short story estimate: about ${selected.estimatedMinutes} minutes.`
        : `${TIER_LABELS[state.tier].name} estimate: ${formatCredits(selected.credits)}, about ${selected.estimatedMinutes} minutes.`
      : "";

  React.useEffect(() => {
    onQuote?.(
      selected && !quotePending
        ? {
            credits: selected.credits,
            balance,
            covered: balance === null ? null : balance >= selected.credits,
            chapters,
            wordsPerChapter,
            tier: state.tier,
            ...(experience === "trial_short_story" ? { label: "Included" } : {}),
          }
        : null,
    );
  }, [balance, chapters, experience, onQuote, quotePending, selected, state.tier, wordsPerChapter]);

  return (
    <div className="space-y-5">
      {currentQuoteError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm"
        >
          <span className="text-destructive">{currentQuoteError}</span>
          <button
            type="button"
            onClick={() => {
              setEstimates({});
              setQuotedShape(null);
              setLoading(true);
              setQuoteError(null);
              retryQuote();
            }}
            className="min-h-11 rounded-sm font-medium text-foreground underline underline-offset-4 sm:min-h-9"
          >
            Try the quote again
          </button>
        </div>
      ) : null}
      {experience === "trial_short_story" ? (
        <section
          aria-label="Included production quality"
          className="instrument-surface flex flex-col gap-1.5 rounded-sm border-primary/45 p-4"
        >
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-display text-sm font-semibold tracking-tight">
              Standard production
            </span>
            <span className="folio-label text-primary">Included</span>
          </span>
          <span className="text-xs leading-relaxed text-muted-foreground">
            Your story is planned, written, edited, and checked for continuity with the same Studio
            tools available to full books.
          </span>
          <span className="text-xs text-ai">{modelMix("standard")}</span>
        </section>
      ) : (
        <RadioGroup
          aria-label="Quality tier"
          value={state.tier}
          onValueChange={(value) => {
            if (typeof value === "string") {
              dispatch({ type: "patch", patch: { tier: value as QualityTier } });
            }
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          {TIERS.map((tier) => {
            const estimate = estimates[tier];
            const active = state.tier === tier;
            const optionLabel =
              estimate && !quotePending
                ? `${TIER_LABELS[tier].name} — ${formatCredits(estimate.credits)}`
                : `${TIER_LABELS[tier].name} — estimate still loading`;
            return (
              <label
                key={tier}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-sm border bg-card p-4 transition-colors",
                  active ? "border-primary ring-1 ring-primary" : "hover:border-foreground/25",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold tracking-tight">
                    {TIER_LABELS[tier].name}
                  </span>
                  <RadioGroupItem value={tier} aria-label={optionLabel} />
                </span>
                <span className="text-xs text-muted-foreground">{TIER_LABELS[tier].blurb}</span>
                <span className="text-xs text-ai">{modelMix(tier)}</span>
                <span className="mt-auto pt-1.5 font-mono text-sm tabular-nums">
                  {estimate && !quotePending ? (
                    formatCredits(estimate.credits)
                  ) : (
                    <Skeleton className="h-4 w-24" />
                  )}
                </span>
              </label>
            );
          })}
        </RadioGroup>
      )}

      {/* The receipt — itemized, honest, mono */}
      <div className="manuscript-sheet p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="font-display text-xs tracking-[0.25em] text-paper-muted uppercase">
            Estimate — {TIER_LABELS[state.tier].name}
          </p>
          {selected && !quotePending ? (
            <p className="font-mono text-xs text-paper-muted">
              Estimated production time: ~{selected.estimatedMinutes} min
            </p>
          ) : null}
        </div>
        <div className="mt-4 font-mono text-sm text-paper-foreground" aria-busy={quotePending}>
          {selected && !quotePending ? (
            <>
              <ul className="space-y-1.5">
                {selected.stages.map((stage) => (
                  <li key={stage.stage} className="flex items-baseline gap-2">
                    <span>{stage.stage}</span>
                    <span
                      aria-hidden="true"
                      className="flex-1 border-b border-dotted border-paper-edge"
                    />
                    <span className="tabular-nums">
                      {experience === "trial_short_story"
                        ? "Included"
                        : formatCredits(
                            stage.usd * (selected.credits / Math.max(selected.totalUsd, 0.0001)),
                          )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-baseline gap-2 border-t border-paper-edge pt-3 font-semibold">
                <span>Total</span>
                <span aria-hidden="true" className="flex-1" />
                <span className="tabular-nums">
                  {experience === "trial_short_story"
                    ? "Included"
                    : formatCredits(selected.credits)}
                </span>
              </div>
              <p className="mt-3 text-xs text-paper-muted">
                {experience === "trial_short_story"
                  ? "One complete short story is included with your account. Optional Studio tools use the remaining included allowance after writing finishes."
                  : "±30% — credits are only debited for what actually runs, and writing pauses (not fails) if your balance runs out."}
              </p>
            </>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          )}
        </div>
      </div>

      {experience === "full_book" && selected && balance !== null ? (
        <p className={cn("text-xs", short ? "text-ember" : "text-muted-foreground")}>
          {short ? (
            <>
              Your balance is {formatCredits(balance)} — this book needs about{" "}
              {formatCredits(selected.credits)}. Add credits before starting; your setup will be
              saved when you use{" "}
              <span className="font-medium text-foreground">Add credits to start</span> below.
            </>
          ) : (
            `Covered by your balance: ${formatCredits(balance)} available.`
          )}
        </p>
      ) : null}

      {experience === "trial_short_story" ? (
        <div className="rounded-sm border bg-card p-4">
          <p className="text-sm font-medium">You approve the outline before drafting begins</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Read the chapter plan, request changes, or approve it when you are ready. No chapter is
            written before that decision.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-sm border bg-card p-4">
          <div className="space-y-0.5">
            <Label htmlFor="wizard-approval">Pause for my outline approval</Label>
            <p id="wizard-approval-hint" className="text-xs text-muted-foreground">
              The run stops after the outline and waits for you before any chapters are drafted.
            </p>
          </div>
          <Switch
            id="wizard-approval"
            aria-describedby="wizard-approval-hint"
            checked={state.requireOutlineApproval}
            onCheckedChange={(checked) =>
              dispatch({ type: "patch", patch: { requireOutlineApproval: checked === true } })
            }
          />
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
