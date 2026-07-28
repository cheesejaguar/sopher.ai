"use client";

import { VOICE_PROFILE_IDS, VOICE_PROFILES } from "@/ai/knowledge/voice-profiles";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  MAX_CHAPTERS,
  MAX_WORDS_PER_CHAPTER,
  MIN_CHAPTERS,
  MIN_WORDS_PER_CHAPTER,
  WORDS_PER_PAGE,
  type HeatLevel,
  type Pov,
  type ProfanityLevel,
  type Tense,
  type ViolenceLevel,
  type WizardActionEvent,
  type WizardState,
} from "@/components/wizard/wizard-state";

const voiceItems: Record<string, string> = {
  none: "House style — no preset voice",
  ...Object.fromEntries(
    VOICE_PROFILE_IDS.map((id) => {
      const profile = VOICE_PROFILES[id];
      return [id, `${profile.name} — ${profile.description}`];
    }),
  ),
};

const povItems: Record<Pov, string> = {
  first: "First person",
  third_limited: "Third person, limited",
  third_omniscient: "Third person, omniscient",
};

const tenseItems: Record<Tense, string> = {
  past: "Past tense",
  present: "Present tense",
};

const heatItems: Record<HeatLevel, string> = {
  none: "None — closed door",
  mild: "Mild — kisses and tension",
  moderate: "Moderate — some heat on the page",
  explicit: "Explicit",
};

const violenceItems: Record<ViolenceLevel, string> = {
  none: "None",
  mild: "Mild — off-page or implied",
  moderate: "Moderate — on-page, not dwelt on",
  graphic: "Graphic",
};

const profanityItems: Record<ProfanityLevel, string> = {
  none: "None",
  mild: "Mild",
  moderate: "Moderate",
  strong: "Strong",
};

function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}

function SettingSelect<T extends string>({
  id,
  label,
  items,
  value,
  onChange,
}: {
  id: string;
  label: string;
  items: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next as T);
        }}
      >
        <SelectTrigger id={id} className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(items) as [T, string][]).map(([itemValue, itemLabel]) => (
            <SelectItem key={itemValue} value={itemValue}>
              {itemLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function StepShape({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardActionEvent>;
}) {
  const totalWords = state.chapters * state.wordsPerChapter;
  const pages = Math.round(totalWords / WORDS_PER_PAGE);
  const spineWidth = Math.min(96, Math.max(12, Math.round(6 + pages * 0.09)));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 rounded-xl border bg-card p-5 sm:grid-cols-[1fr_auto]">
        <div className="space-y-6">
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              {/* Base UI renders the real control as an <input type="range"> nested
                  inside the thumb, so `htmlFor` cannot reach it. `aria-labelledby`
                  on the root is forwarded to that input and names it correctly. */}
              <Label id="wizard-chapters-label">Chapters</Label>
              <span className="font-mono text-sm tabular-nums">{state.chapters}</span>
            </div>
            <Slider
              aria-labelledby="wizard-chapters-label"
              min={MIN_CHAPTERS}
              max={MAX_CHAPTERS}
              step={1}
              value={[state.chapters]}
              onValueChange={(value) =>
                dispatch({ type: "patch", patch: { chapters: sliderValue(value) } })
              }
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label id="wizard-words-label">Words per chapter</Label>
              <span className="font-mono text-sm tabular-nums">
                {state.wordsPerChapter.toLocaleString("en-US")}
              </span>
            </div>
            <Slider
              aria-labelledby="wizard-words-label"
              min={MIN_WORDS_PER_CHAPTER}
              max={MAX_WORDS_PER_CHAPTER}
              step={250}
              value={[state.wordsPerChapter]}
              onValueChange={(value) =>
                dispatch({ type: "patch", patch: { wordsPerChapter: sliderValue(value) } })
              }
            />
          </div>
        </div>

        {/* Spine + page-count readout */}
        <div className="flex items-center gap-4 sm:flex-col sm:justify-center sm:gap-2 sm:pl-2">
          <div className="flex h-24 items-end" aria-hidden="true">
            <div
              className="paper-surface h-full rounded-[3px] transition-[width] duration-200"
              style={{ width: `${spineWidth}px` }}
            >
              <div className="mx-auto mt-2 h-[calc(100%-1rem)] w-px bg-paper-edge" />
            </div>
          </div>
          <p className="text-center font-mono text-xs text-muted-foreground tabular-nums">
            ≈ {pages.toLocaleString("en-US")} pages
            <br />
            {totalWords.toLocaleString("en-US")} words
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <p className="text-sm font-medium">Voice and perspective</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <SettingSelect
              id="wizard-voice"
              label="Voice preset"
              items={voiceItems}
              value={state.voiceProfile}
              onChange={(voiceProfile) =>
                dispatch({
                  type: "patch",
                  patch: { voiceProfile: voiceProfile as WizardState["voiceProfile"] },
                })
              }
            />
          </div>
          <SettingSelect
            id="wizard-pov"
            label="Point of view"
            items={povItems}
            value={state.pov}
            onChange={(pov) => dispatch({ type: "patch", patch: { pov } })}
          />
          <SettingSelect
            id="wizard-tense"
            label="Tense"
            items={tenseItems}
            value={state.tense}
            onChange={(tense) => dispatch({ type: "patch", patch: { tense } })}
          />
        </div>

        <Separator />

        <p className="text-sm font-medium">Content limits</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <SettingSelect
            id="wizard-heat"
            label="Heat"
            items={heatItems}
            value={state.heatLevel}
            onChange={(heatLevel) => dispatch({ type: "patch", patch: { heatLevel } })}
          />
          <SettingSelect
            id="wizard-violence"
            label="Violence"
            items={violenceItems}
            value={state.violenceLevel}
            onChange={(violenceLevel) => dispatch({ type: "patch", patch: { violenceLevel } })}
          />
          <SettingSelect
            id="wizard-profanity"
            label="Profanity"
            items={profanityItems}
            value={state.profanity}
            onChange={(profanity) => dispatch({ type: "patch", patch: { profanity } })}
          />
        </div>
      </div>
    </div>
  );
}
