"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { CreativeQuestionForAuthor } from "@/lib/creative-decisions";
import { cn } from "@/lib/utils";

function requestKey(): string {
  return crypto.randomUUID();
}

type DecisionBody = {
  kind: "creative-decision";
  questionId: string;
  decisionDigest: string;
  mode: "option" | "custom" | "sopher";
  selectedOptionId?: "option-1" | "option-2" | "option-3";
  customResponse?: string;
  requestKey: string;
};

export function creativeDecisionCardKey(
  question: Pick<CreativeQuestionForAuthor, "id" | "decisionDigest">,
): string {
  return `${question.id}:${question.decisionDigest}`;
}

export function CreativeDecisionCard({
  runId,
  question,
  onAccepted,
  onRefreshRequested,
}: {
  runId: string;
  question: CreativeQuestionForAuthor;
  onAccepted?: () => void | Promise<void>;
  onRefreshRequested?: () => void | Promise<void>;
}) {
  const [selection, setSelection] = React.useState<string>(question.recommendedOptionId);
  const [customResponse, setCustomResponse] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submittedBody, setSubmittedBody] = React.useState<DecisionBody | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);

  React.useEffect(() => {
    if (window.location.hash === "#creative-decision" || document.activeElement === document.body) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, []);

  async function send(body: DecisionBody) {
    if (pending || accepted) return;
    const requestBody = submittedBody ?? body;
    setSubmittedBody(requestBody);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${runId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: unknown;
        code?: unknown;
      } | null;
      if (!response.ok && response.status !== 202) {
        // A conflict is a definitive rejection, not an ambiguous response-loss
        // case. The saved request body may refer to a question that Workflow has
        // already replaced or consumed, so keeping it frozen would make every
        // retry repeat the same invalid answer. Unlock the card and ask the
        // parent to hydrate the latest authoritative question instead.
        if (response.status === 409) {
          setSubmittedBody(null);
          void Promise.resolve(onRefreshRequested?.()).catch(() => undefined);
        }
        setError(
          typeof result?.error === "string"
            ? result.error
            : "That direction could not be saved. Your book remains paused.",
        );
        return;
      }
      setAccepted(true);
      await onAccepted?.();
    } catch {
      setError(
        "The Studio did not receive a confirmation. Retry the same answer; it will not be applied twice.",
      );
    } finally {
      setPending(false);
    }
  }

  function chooseDirection() {
    if (submittedBody) {
      void send(submittedBody);
      return;
    }
    if (selection === "custom") {
      const answer = customResponse.trim();
      if (!answer) {
        setError("Write the direction you want Sopher to follow.");
        return;
      }
      void send({
        kind: "creative-decision",
        questionId: question.id,
        decisionDigest: question.decisionDigest,
        mode: "custom",
        customResponse: answer,
        requestKey: requestKey(),
      });
      return;
    }
    void send({
      kind: "creative-decision",
      questionId: question.id,
      decisionDigest: question.decisionDigest,
      mode: "option",
      selectedOptionId: selection as "option-1" | "option-2" | "option-3",
      requestKey: requestKey(),
    });
  }

  function letSopherDecide() {
    if (submittedBody) {
      void send(submittedBody);
      return;
    }
    void send({
      kind: "creative-decision",
      questionId: question.id,
      decisionDigest: question.decisionDigest,
      mode: "sopher",
      requestKey: requestKey(),
    });
  }

  const locked = pending || accepted || submittedBody !== null;
  const rationaleId = `creative-question-rationale-${question.id}`;
  const errorId = `creative-question-error-${question.id}`;

  return (
    <section
      id="creative-decision"
      aria-labelledby={`creative-question-title-${question.id}`}
      className="instrument-surface-raised scroll-mt-28 rounded-sm border border-ai/45 px-4 py-5 sm:px-6 sm:py-6"
    >
      <div className="max-w-3xl">
        <p className="folio-label flex items-center gap-2 text-ai">
          <Sparkles aria-hidden="true" className="size-3.5" />
          One choice before the outline
        </p>
        <h2
          ref={headingRef}
          id={`creative-question-title-${question.id}`}
          tabIndex={-1}
          className="mt-3 text-xl font-semibold tracking-[-0.02em] text-balance focus:outline-none sm:text-2xl"
        >
          {question.question}
        </h2>
        <p id={rationaleId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {question.rationale}
        </p>
      </div>

      <fieldset className="mt-5" disabled={locked} aria-describedby={rationaleId}>
        <legend className="sr-only">Choose one story direction or write your own</legend>
        <RadioGroup
          value={selection}
          disabled={locked}
          onValueChange={(value) => {
            setSelection(String(value));
            setError(null);
          }}
          className="gap-3"
        >
          <div className="grid gap-3 lg:grid-cols-3">
            {question.options.map((option) => {
              const recommended = option.id === question.recommendedOptionId;
              const selected = selection === option.id;
              return (
                <label
                  key={option.id}
                  htmlFor={`${question.id}-${option.id}`}
                  className={cn(
                    "flex min-h-32 cursor-pointer items-start gap-3 rounded-sm border p-4 transition-colors",
                    selected
                      ? "border-ai bg-ai-soft"
                      : "border-border bg-card/35 hover:border-ai/50",
                    locked && "cursor-default opacity-70",
                  )}
                >
                  <RadioGroupItem
                    id={`${question.id}-${option.id}`}
                    value={option.id}
                    className="mt-1 size-5"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {option.label}
                      {recommended ? <Badge variant="secondary">Recommended</Badge> : null}
                    </span>
                    <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div
            className={cn(
              "rounded-sm border p-4",
              selection === "custom" ? "border-ai bg-ai-soft" : "border-border bg-card/35",
            )}
          >
            <label
              htmlFor={`${question.id}-custom`}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"
            >
              <RadioGroupItem id={`${question.id}-custom`} value="custom" />I have another direction
            </label>
            {selection === "custom" ? (
              <Textarea
                value={customResponse}
                onChange={(event) => {
                  setCustomResponse(event.target.value);
                  setError(null);
                }}
                maxLength={2_000}
                rows={4}
                aria-label="Your story direction"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? errorId : undefined}
                placeholder="Tell Sopher what you want the story to explore…"
                className="mt-3 bg-background"
              />
            ) : null}
          </div>
        </RadioGroup>
      </fieldset>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          onClick={chooseDirection}
          aria-busy={pending || undefined}
          aria-disabled={pending || accepted}
          disabled={accepted}
          className="min-h-11"
        >
          {pending ? <Spinner aria-hidden="true" /> : null}
          {accepted
            ? "Direction saved"
            : submittedBody
              ? "Retry saved answer"
              : "Use this direction"}
        </Button>
        <Button
          variant="outline"
          onClick={letSopherDecide}
          aria-disabled={pending || accepted || submittedBody !== null}
          disabled={accepted || submittedBody !== null}
          className="min-h-11"
        >
          Let Sopher decide
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground sm:ml-1">
          Your answer shapes the outline. You can still revise the outline before drafting.
        </p>
      </div>
      {accepted ? (
        <p role="status" className="mt-3 text-sm text-ai">
          Direction saved. Sopher is continuing with the chapter plan.
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
