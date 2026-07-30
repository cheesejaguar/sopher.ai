"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectSettings } from "@/db/schema";
import { updateProject } from "@/lib/actions/projects";
import { GENRES } from "@/lib/genres";
import { VOICE_PROFILE_IDS, VOICE_PROFILES } from "@/ai/knowledge/voice-profiles";

/**
 * Post-creation editing for everything the wizard set: genre, shape, style
 * guide, POV/tense/tone and content boundaries. One form, one action.
 */
export function ProjectSettingsForm({
  projectId,
  defaults,
}: {
  projectId: string;
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
            requireOutlineApproval: formData.get("requireOutlineApproval") === "on",
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

      <label
        htmlFor="ps-outline-approval"
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border px-3 py-2 text-sm"
      >
        <input
          id="ps-outline-approval"
          name="requireOutlineApproval"
          type="checkbox"
          defaultChecked={defaults.settings.requireOutlineApproval ?? false}
          className="size-4 accent-primary"
        />
        <span>
          Pause for my approval before writing chapters
          <span className="mt-0.5 block text-xs text-muted-foreground">
            You can review or request a revised outline before manuscript production begins.
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
