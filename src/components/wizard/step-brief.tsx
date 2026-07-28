"use client";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { genreLabel, type GenreId } from "@/lib/genres";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MIN_BRIEF_LENGTH,
  type WizardActionEvent,
  type WizardState,
} from "@/components/wizard/wizard-state";

const BRIEF_PLACEHOLDERS: Record<GenreId, string> = {
  romance:
    "Two people who shouldn't work, and why they do. Who are they before they meet, what keeps them apart, and how should the ending feel?",
  mystery:
    "A crime, a place that keeps secrets, and the person who won't let it rest. What's the puzzle, and what does solving it cost?",
  fantasy:
    "A world with its own rules, and the person those rules break. What's the magic, what does it cost, and what's at stake?",
  thriller:
    "Someone in over their head, a clock already running. Who's after them, what happens if they fail, and how dark should it get?",
  literary_fiction:
    "A person at a turning point. What do they want, what are they avoiding, and what truth should the reader be left holding?",
  science_fiction:
    "A 'what if' worth following to its end. What's the technology or discovery, how has it changed daily life, and whose story shows it best?",
  horror:
    "The thing in the dark and the person who has to face it. Where does the dread live, and how much should the ending resolve?",
};

const DEFAULT_PLACEHOLDER =
  "Tell the story in your own words — the premise, the people, and the feeling it should leave behind.";

export function StepBrief({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardActionEvent>;
}) {
  const briefLength = state.brief.trim().length;
  const placeholder = state.genre ? BRIEF_PLACEHOLDERS[state.genre] : DEFAULT_PLACEHOLDER;

  return (
    <div className="space-y-4">
      <div className="paper-surface px-6 py-8 sm:px-10 sm:py-10">
        <p className="text-center font-display text-xs tracking-[0.25em] text-paper-muted uppercase">
          {genreLabel(state.genre)}
          {state.subgenre ? ` · ${state.subgenre}` : ""}
        </p>
        <label htmlFor="wizard-brief" className="sr-only">
          Your brief
        </label>
        <textarea
          id="wizard-brief"
          value={state.brief}
          onChange={(event) => dispatch({ type: "patch", patch: { brief: event.target.value } })}
          placeholder={placeholder}
          rows={10}
          required
          aria-describedby="wizard-brief-hint"
          className="prose-manuscript mx-auto mt-6 block w-full resize-none bg-transparent outline-none placeholder:text-paper-muted/70"
        />
        {/* Deliberately not a live region: it changes on every keystroke. */}
        <p
          id="wizard-brief-hint"
          className={cn(
            "mt-4 text-center font-mono text-xs tabular-nums",
            briefLength >= MIN_BRIEF_LENGTH ? "text-paper-muted" : "text-paper-muted/70",
          )}
        >
          {briefLength >= MIN_BRIEF_LENGTH
            ? `${briefLength.toLocaleString("en-US")} characters`
            : "A few sentences is enough to start"}
          <span className="sr-only">
            {briefLength >= MIN_BRIEF_LENGTH
              ? ""
              : ` — at least ${MIN_BRIEF_LENGTH} characters are needed before you can continue`}
          </span>
        </p>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 transition-transform group-data-panel-open:rotate-180"
          />
          Add details — title, protagonist, setting (optional)
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="wizard-title">Working title</Label>
              <Input
                id="wizard-title"
                value={state.title}
                maxLength={200}
                placeholder="The agents will suggest one"
                onChange={(event) =>
                  dispatch({ type: "patch", patch: { title: event.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-protagonist">Protagonist</Label>
              <Input
                id="wizard-protagonist"
                value={state.protagonist}
                maxLength={200}
                placeholder="Name, and who they are"
                onChange={(event) =>
                  dispatch({ type: "patch", patch: { protagonist: event.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-setting">Setting</Label>
              <Input
                id="wizard-setting"
                value={state.setting}
                maxLength={200}
                placeholder="Where and when"
                onChange={(event) =>
                  dispatch({ type: "patch", patch: { setting: event.target.value } })
                }
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
