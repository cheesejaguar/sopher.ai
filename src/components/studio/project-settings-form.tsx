"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectSettings } from "@/db/schema";
import { updateProject } from "@/lib/actions/projects";
import { GENRES } from "@/lib/genres";
import { VOICE_PROFILE_IDS, VOICE_PROFILES } from "@/ai/knowledge/voice-profiles";
import type { ProjectExperience } from "@/lib/trial-story";
import { TRIAL_STORY_CONFIG } from "@/lib/trial-story";
import { fullBookUnlockHref } from "@/lib/marketing/trial-offer";

/**
 * Post-creation editing for everything the wizard set: genre, shape, style
 * guide, POV/tense/tone and content boundaries. One form, one action.
 */
export function ProjectSettingsForm({
  projectId,
  defaults,
  experience = "full_book",
}: {
  projectId: string;
  experience?: ProjectExperience;
  defaults: {
    genre: string;
    targetChapters: number;
    targetWordsPerChapter: number;
    styleGuide: string;
    settings: ProjectSettings;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    if (pending) return;
    setError(null);
    setSaved(false);
    const read = (key: string) => String(formData.get(key) ?? "").trim();
    const avoidTopics = read("avoidTopics")
      .split(/[,\n]/)
      .map((topic) => topic.trim())
      .filter(Boolean)
      .slice(0, 20);
    startTransition(async () => {
      try {
        await updateProject(projectId, {
          genre: read("genre") || undefined,
          targetChapters: Number(formData.get("targetChapters")),
          targetWordsPerChapter: Number(formData.get("targetWordsPerChapter")),
          styleGuide: read("styleGuide") || undefined,
          settings: {
            ...defaults.settings,
            authoringMode: read("authoringMode") === "autopilot" ? "autopilot" : "guided",
            pov: (read("pov") || undefined) as ProjectSettings["pov"],
            tense: (read("tense") || undefined) as ProjectSettings["tense"],
            tone: read("tone") || undefined,
            voiceProfile: read("voiceProfile") || undefined,
            styleProfile: read("styleProfile") || undefined,
            heatLevel: (read("heatLevel") || undefined) as ProjectSettings["heatLevel"],
            violenceLevel: (read("violenceLevel") || undefined) as ProjectSettings["violenceLevel"],
            profanity: (read("profanity") || undefined) as ProjectSettings["profanity"],
            avoidTopics,
            qualityTier: (read("qualityTier") || undefined) as ProjectSettings["qualityTier"],
            requireOutlineApproval:
              experience === "trial_short_story"
                ? TRIAL_STORY_CONFIG.requireOutlineApproval
                : formData.get("requireOutlineApproval") === "on",
          },
        });
        setSaved(true);
      } catch {
        setError("Could not save — check the values and try again.");
      }
    });
  }

  const selectClass =
    "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring h-11 w-full rounded-sm border px-3 text-sm shadow-xs focus-visible:ring-[3px] outline-none sm:h-9";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        submit(new FormData(event.currentTarget));
      }}
      className="instrument-surface space-y-5 rounded-sm p-5 sm:p-6"
    >
      {experience === "trial_short_story" ? (
        <section aria-labelledby="included-shape-title" className="border-b border-border pb-5">
          <input type="hidden" name="targetChapters" value={TRIAL_STORY_CONFIG.targetChapters} />
          <input
            type="hidden"
            name="targetWordsPerChapter"
            value={TRIAL_STORY_CONFIG.targetWordsPerChapter}
          />
          <input type="hidden" name="qualityTier" value={TRIAL_STORY_CONFIG.tier} />
          <h2 id="included-shape-title" className="text-sm font-semibold">
            Included short-story shape
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            This project stays at three chapters, about 1,000 words each, and Standard quality.
            Voice, perspective, boundaries, and style remain yours to change below.
          </p>
          <dl className="mt-4 grid grid-cols-3 border-y border-border">
            <div className="border-r border-border py-3 pr-3">
              <dt className="folio-label text-muted-foreground">Chapters</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {TRIAL_STORY_CONFIG.targetChapters}
              </dd>
            </div>
            <div className="border-r border-border px-3 py-3">
              <dt className="folio-label text-muted-foreground">Length</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                ~{TRIAL_STORY_CONFIG.targetWordsPerChapter.toLocaleString("en-US")}
              </dd>
            </div>
            <div className="py-3 pl-3">
              <dt className="folio-label text-muted-foreground">Quality</dt>
              <dd className="mt-1 text-sm font-medium capitalize">{TRIAL_STORY_CONFIG.tier}</dd>
            </div>
          </dl>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={fullBookUnlockHref(projectId)} />}
            className="mt-4 rounded-sm"
          >
            Unlock full-length controls
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Button>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ps-genre">Genre</Label>
          <select id="ps-genre" name="genre" defaultValue={defaults.genre} className={selectClass}>
            {GENRES.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
        </div>
        {experience === "full_book" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ps-tier">Quality tier</Label>
              <select
                id="ps-tier"
                name="qualityTier"
                defaultValue={defaults.settings.qualityTier ?? "standard"}
                className={selectClass}
              >
                <option value="draft">Draft</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-chapters">Chapters</Label>
              <Input
                id="ps-chapters"
                name="targetChapters"
                type="number"
                min={3}
                max={60}
                defaultValue={defaults.targetChapters}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-words">Words per chapter</Label>
              <Input
                id="ps-words"
                name="targetWordsPerChapter"
                type="number"
                min={800}
                max={8000}
                step={100}
                defaultValue={defaults.targetWordsPerChapter}
              />
            </div>
          </>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="ps-pov">Point of view</Label>
          <select
            id="ps-pov"
            name="pov"
            defaultValue={defaults.settings.pov ?? ""}
            className={selectClass}
          >
            <option value="">Let the agents choose</option>
            <option value="first">First person</option>
            <option value="third_limited">Third limited</option>
            <option value="third_omniscient">Third omniscient</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ps-tense">Tense</Label>
          <select
            id="ps-tense"
            name="tense"
            defaultValue={defaults.settings.tense ?? ""}
            className={selectClass}
          >
            <option value="">Let the agents choose</option>
            <option value="past">Past</option>
            <option value="present">Present</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ps-voice">Voice profile</Label>
          <select
            id="ps-voice"
            name="voiceProfile"
            defaultValue={defaults.settings.voiceProfile ?? ""}
            className={selectClass}
          >
            <option value="">No preset voice</option>
            {VOICE_PROFILE_IDS.map((id) => (
              <option key={id} value={id}>
                {VOICE_PROFILES[id].name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ps-style-profile">Style profile</Label>
          <Input
            id="ps-style-profile"
            name="styleProfile"
            defaultValue={defaults.settings.styleProfile ?? ""}
            maxLength={100}
            placeholder="Cinematic, literary, cozy…"
          />
        </div>
      </div>

      <fieldset className="space-y-3 border-t border-border pt-5">
        <legend className="folio-label px-1 text-muted-foreground">Content boundaries</legend>
        <p className="text-xs leading-relaxed text-muted-foreground">
          These are ceilings, not requests to add mature content.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ps-heat">Romance / heat</Label>
            <select
              id="ps-heat"
              name="heatLevel"
              defaultValue={defaults.settings.heatLevel ?? "none"}
              className={selectClass}
            >
              <option value="none">None</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="explicit">Explicit</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-violence">Violence</Label>
            <select
              id="ps-violence"
              name="violenceLevel"
              defaultValue={defaults.settings.violenceLevel ?? "mild"}
              className={selectClass}
            >
              <option value="none">None</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="graphic">Graphic</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-profanity">Profanity</Label>
            <select
              id="ps-profanity"
              name="profanity"
              defaultValue={defaults.settings.profanity ?? "mild"}
              className={selectClass}
            >
              <option value="none">None</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="strong">Strong</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ps-avoid-topics">Topics to avoid</Label>
          <Textarea
            id="ps-avoid-topics"
            name="avoidTopics"
            defaultValue={(defaults.settings.avoidTopics ?? []).join("\n")}
            rows={3}
            placeholder="One topic per line"
          />
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="ps-tone">Tone</Label>
        <Input
          id="ps-tone"
          name="tone"
          defaultValue={defaults.settings.tone ?? ""}
          maxLength={200}
          placeholder="Wry, warm, a little melancholy…"
        />
      </div>

      <fieldset className="space-y-3 border-t border-border pt-5">
        <legend className="folio-label px-1 text-muted-foreground">Authoring mode</legend>
        <p id="ps-authoring-mode-help" className="text-xs leading-relaxed text-muted-foreground">
          Choose whether the next full production pauses once after the concept so you can steer a
          meaningful creative decision. This setting is frozen when a run starts.
        </p>
        <div className="grid gap-3 sm:grid-cols-2" aria-describedby="ps-authoring-mode-help">
          <label className="flex min-h-24 cursor-pointer gap-3 rounded-sm border border-border p-4 text-sm has-checked:border-primary has-checked:ring-1 has-checked:ring-primary">
            <input
              type="radio"
              name="authoringMode"
              value="guided"
              defaultChecked={(defaults.settings.authoringMode ?? "guided") === "guided"}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              <span className="flex flex-wrap items-baseline gap-2 font-medium">
                Collaborative
                <span className="folio-label text-primary">Recommended</span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Answer one focused question with three suggested directions, a custom response, or
                let Sopher choose.
              </span>
            </span>
          </label>
          <label className="flex min-h-24 cursor-pointer gap-3 rounded-sm border border-border p-4 text-sm has-checked:border-primary has-checked:ring-1 has-checked:ring-primary">
            <input
              type="radio"
              name="authoringMode"
              value="autopilot"
              defaultChecked={defaults.settings.authoringMode === "autopilot"}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              <span className="font-medium">Autopilot</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Sopher makes that decision and continues without the creative check-in.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <label
        htmlFor="ps-outline-approval"
        className={`flex min-h-11 items-center gap-3 rounded-sm border border-border px-3 py-2 text-sm ${
          experience === "trial_short_story" ? "cursor-default bg-muted/30" : "cursor-pointer"
        }`}
      >
        {experience === "trial_short_story" ? (
          <input type="hidden" name="requireOutlineApproval" value="on" />
        ) : null}
        <input
          id="ps-outline-approval"
          name={experience === "trial_short_story" ? undefined : "requireOutlineApproval"}
          type="checkbox"
          defaultChecked={
            experience === "trial_short_story"
              ? undefined
              : (defaults.settings.requireOutlineApproval ?? false)
          }
          checked={experience === "trial_short_story" ? true : undefined}
          disabled={experience === "trial_short_story"}
          readOnly={experience === "trial_short_story"}
          aria-describedby={
            experience === "trial_short_story" ? "ps-outline-approval-help" : undefined
          }
          className="size-4 accent-primary"
        />
        <span>
          Pause for my approval before writing chapters
          <span
            id={experience === "trial_short_story" ? "ps-outline-approval-help" : undefined}
            className="mt-0.5 block text-xs text-muted-foreground"
          >
            {experience === "trial_short_story"
              ? "Included stories always pause here so you can approve or revise the plan before any chapters are written."
              : "You can review or request a revised outline before manuscript production begins."}
          </span>
        </span>
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="ps-style">Style guide</Label>
        <Textarea
          id="ps-style"
          name="styleGuide"
          defaultValue={defaults.styleGuide}
          rows={6}
          maxLength={10_000}
          placeholder="House rules for the prose: sentence rhythm, vocabulary, things to avoid…"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          aria-disabled={pending}
          aria-busy={pending}
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <div className="min-h-5 text-sm" aria-live="polite">
          <p role="status" className="text-ai">
            {saved ? "Saved." : ""}
          </p>
          <p role="alert" className="text-destructive">
            {error ?? ""}
          </p>
        </div>
      </div>
    </form>
  );
}
