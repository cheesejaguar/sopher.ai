"use client";

import { genreLabel, type GenreId } from "@/lib/genres";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CUSTOM_GENRE,
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
  historical_fiction:
    "A real time and place, and someone ordinary living inside it. When and where exactly, who are they, and what does their world forbid them?",
  young_adult:
    "Someone figuring out who they are, and the choice that forces it. What do they believe about themselves, and what proves it wrong?",
  middle_grade:
    "A kid, a problem too big for them, and the friends who help. What are they trying to do, and what do they learn they can do alone?",
  childrens:
    "Who is the story for, and who is the hero? Describe the one problem, the funny parts, and how you want a child to feel at the end.",
  memoir:
    "The true story you want to tell — the period it covers, the people in it, and the question you're still trying to answer about it.",
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
  // A custom genre has no template and therefore no tailored prompt; the
  // generic one is the right thing to show rather than a blank field.
  const placeholder =
    state.genre && state.genre !== CUSTOM_GENRE
      ? BRIEF_PLACEHOLDERS[state.genre]
      : DEFAULT_PLACEHOLDER;

  return (
    <div className="space-y-4">
      <div className="instrument-surface rounded-sm p-4 sm:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-title">Working title</Label>
          <Input
            id="wizard-title"
            value={state.title}
            maxLength={200}
            required
            aria-describedby="wizard-title-hint"
            autoComplete="off"
            placeholder="The title you want to see on the cover"
            onChange={(event) => dispatch({ type: "patch", patch: { title: event.target.value } })}
          />
          <p id="wizard-title-hint" className="text-xs leading-relaxed text-muted-foreground">
            This stays with the project from first outline to finished manuscript. You can rename it
            later.
          </p>
        </div>
      </div>

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
          className="prose-manuscript mx-auto mt-6 block w-full resize-none bg-transparent outline-none placeholder:text-paper-muted"
        />
        {/* Deliberately not a live region: it changes on every keystroke. */}
        <p
          id="wizard-brief-hint"
          className="mt-4 text-center font-mono text-xs text-paper-muted tabular-nums"
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

      <section aria-labelledby="story-anchors-title" className="instrument-surface rounded-sm p-4">
        <h3 id="story-anchors-title" className="text-sm font-semibold">
          Give the Story Bible a head start
        </h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          These details are optional. Specific appearance, motivation, place, and period notes help
          the writing team keep later chapters and generated portraits consistent.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wizard-protagonist">Protagonist</Label>
            <Input
              id="wizard-protagonist"
              value={state.protagonist}
              maxLength={200}
              placeholder="Mara, a stubborn retired cartographer with a silver braid"
              aria-describedby="wizard-protagonist-hint"
              onChange={(event) =>
                dispatch({ type: "patch", patch: { protagonist: event.target.value } })
              }
            />
            <p id="wizard-protagonist-hint" className="text-xs text-muted-foreground">
              Name, role, appearance, and what drives them.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wizard-setting">Setting</Label>
            <Input
              id="wizard-setting"
              value={state.setting}
              maxLength={200}
              placeholder="A storm-battered island observatory in 1932"
              aria-describedby="wizard-setting-hint"
              onChange={(event) =>
                dispatch({ type: "patch", patch: { setting: event.target.value } })
              }
            />
            <p id="wizard-setting-hint" className="text-xs text-muted-foreground">
              Place, time period, and one detail that defines the world.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
