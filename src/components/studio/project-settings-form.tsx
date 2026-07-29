"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectSettings } from "@/db/schema";
import { updateProject } from "@/lib/actions/projects";
import { GENRES } from "@/lib/genres";

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
    setError(null);
    setSaved(false);
    const read = (key: string) => String(formData.get(key) ?? "").trim();
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
            qualityTier: (read("qualityTier") || undefined) as ProjectSettings["qualityTier"],
          },
        });
        setSaved(true);
      } catch {
        setError("Could not save — check the values and try again.");
      }
    });
  }

  const selectClass =
    "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-[3px] outline-none";

  return (
    <form action={submit} className="space-y-5">
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
      </div>

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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        {saved ? (
          <p role="status" className="text-sm text-ai">
            Saved.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
