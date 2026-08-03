"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import type { EntityKind } from "@/ai/schemas/entities";
import type { BibleEntity } from "@/db/queries/entities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  createBibleEntity,
  updateBibleEntity,
  type CreatableEntityKind,
} from "@/lib/actions/entities";
import { editableCanonFromAttrs, type EditableEntityCanon } from "@/lib/bible/canon";
import { cn } from "@/lib/utils";

const KIND_OPTIONS: Array<{
  value: CreatableEntityKind;
  label: string;
  description: string;
}> = [
  { value: "character", label: "Character", description: "A person or creature" },
  { value: "location", label: "Place", description: "A setting or destination" },
  { value: "object", label: "Object", description: "An item with story weight" },
];

const FIELD_COPY: Record<
  EntityKind,
  {
    appearance: { label: string; placeholder: string };
    background: { label: string; placeholder: string };
    goals: { label: string; hint: string };
    personality: { label: string; hint: string };
    voice: { label: string; placeholder: string };
    arc: { label: string; placeholder: string };
  }
> = {
  character: {
    appearance: {
      label: "Physical appearance",
      placeholder: "Build, face, hair, clothing, movement, and identifying details",
    },
    background: {
      label: "Background",
      placeholder: "Formative history and circumstances before the story begins",
    },
    goals: { label: "Goals", hint: "One goal per line" },
    personality: { label: "Personality", hint: "One trait per line" },
    voice: {
      label: "Voice",
      placeholder: "Register, rhythm, vocabulary, accent, and verbal habits",
    },
    arc: { label: "Arc", placeholder: "How this character is expected to change" },
  },
  location: {
    appearance: {
      label: "Appearance and layout",
      placeholder: "What is visible, fixed, memorable, and spatially important",
    },
    background: {
      label: "History",
      placeholder: "What shaped this place before the story arrives",
    },
    goals: { label: "Story purpose", hint: "One purpose per line" },
    personality: { label: "Character of the place", hint: "One quality per line" },
    voice: {
      label: "Sensory voice",
      placeholder: "The sounds, textures, smells, and recurring atmosphere",
    },
    arc: { label: "How it changes", placeholder: "How the place evolves through the story" },
  },
  object: {
    appearance: {
      label: "Physical appearance",
      placeholder: "Materials, scale, condition, markings, and identifying details",
    },
    background: { label: "Origin and history", placeholder: "Who made it and where it came from" },
    goals: { label: "Story purpose", hint: "One purpose per line" },
    personality: { label: "Character of the object", hint: "One quality per line" },
    voice: { label: "Voice or presence", placeholder: "How it sounds, feels, or announces itself" },
    arc: { label: "How it changes", placeholder: "How its meaning, holder, or condition changes" },
  },
  organization: {
    appearance: { label: "Visible identity", placeholder: "Symbols, spaces, dress, and markings" },
    background: { label: "Background", placeholder: "Origin, history, and present circumstances" },
    goals: { label: "Goals", hint: "One goal per line" },
    personality: { label: "Character", hint: "One quality per line" },
    voice: { label: "Voice", placeholder: "How members and official messages sound" },
    arc: { label: "Arc", placeholder: "How the organization changes through the story" },
  },
  event: {
    appearance: { label: "Visible details", placeholder: "What witnesses would see and remember" },
    background: { label: "Background", placeholder: "What led to this event" },
    goals: { label: "Forces in motion", hint: "One aim per line" },
    personality: { label: "Tone", hint: "One quality per line" },
    voice: { label: "Voice", placeholder: "Sounds, language, and recurring sensory details" },
    arc: { label: "Arc", placeholder: "How the event develops and resolves" },
  },
};

const EMPTY_CANON: EditableEntityCanon = {
  name: "",
  aliases: [],
  appearance: "",
  background: "",
  goals: [],
  personality: [],
  voice: "",
  arc: "",
  facts: [],
};

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function ListField({
  id,
  name,
  label,
  hint,
  values,
  maxItems,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  values: string[];
  maxItems: number;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        defaultValue={values.join("\n")}
        rows={3}
        maxLength={maxItems * 501}
        aria-describedby={hintId}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}. Up to {maxItems}.
      </p>
    </div>
  );
}

export function EntityCanonDialog({
  projectId,
  entity,
  readOnlyReason,
}: {
  projectId: string;
  entity?: BibleEntity;
  readOnlyReason?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CreatableEntityKind>("character");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const editing = Boolean(entity);
  const entityKind = entity?.kind ?? kind;
  const copy = FIELD_COPY[entityKind];
  const initial = entity
    ? editableCanonFromAttrs({
        kind: entity.kind,
        name: entity.name,
        aliases: entity.aliases,
        attrs: entity.attrs,
      })
    : EMPTY_CANON;
  const actionLabel = editing ? "Edit canon" : "Add entry";

  if (readOnlyReason) {
    const reasonId = `${id}-readonly`;
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled="true"
          aria-describedby={reasonId}
          className="cursor-not-allowed opacity-55"
          onClick={(event) => event.preventDefault()}
        >
          {editing ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {actionLabel}
        </Button>
        <span id={reasonId} className="sr-only">
          {readOnlyReason}
        </span>
      </>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const input = {
      kind: entityKind,
      name: text(formData.get("name")),
      aliases: lines(formData.get("aliases")),
      appearance: text(formData.get("appearance")),
      background: text(formData.get("background")),
      goals: lines(formData.get("goals")),
      personality: lines(formData.get("personality")),
      voice: text(formData.get("voice")),
      arc: text(formData.get("arc")),
      facts: lines(formData.get("facts")),
    };

    setError(null);
    setStatus("");
    startTransition(async () => {
      try {
        const result = entity
          ? await updateBibleEntity(projectId, entity.id, input)
          : await createBibleEntity(projectId, input);
        if (!result.ok) {
          setError(result.message);
          return;
        }

        setStatus(
          entity ? `${input.name} canon saved.` : `${input.name} added to the Story Bible.`,
        );
        setOpen(false);
        router.refresh();
      } catch {
        setError("The Story Bible could not be saved. Your changes are still here — try again.");
      }
    });
  }

  return (
    <>
      {status ? (
        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (pending) return;
          setOpen(nextOpen);
          if (nextOpen) {
            setError(null);
            setStatus("");
            if (!entity) setKind("character");
          }
        }}
      >
        <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
          {editing ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {actionLabel}
        </DialogTrigger>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-4 py-4 pr-14 sm:px-6">
            <DialogTitle>{editing ? `Edit ${entity?.name}` : "Add to the Story Bible"}</DialogTitle>
            <DialogDescription>
              These are the facts future writing and generated images should honor. Manual canon
              edits are free.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
              {!editing ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">Entry type</legend>
                  <RadioGroup
                    value={kind}
                    onValueChange={(value) => {
                      if (typeof value === "string") setKind(value as CreatableEntityKind);
                    }}
                    className="grid gap-2 sm:grid-cols-3"
                  >
                    {KIND_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          "flex min-h-16 cursor-pointer items-start gap-3 rounded-sm border p-3 transition-colors",
                          kind === option.value
                            ? "border-primary bg-primary/8 ring-1 ring-primary"
                            : "border-border hover:border-foreground/30",
                        )}
                      >
                        <RadioGroupItem
                          value={option.value}
                          aria-label={`${option.label}: ${option.description}`}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{option.label}</span>
                          <span className="block text-xs leading-5 text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </fieldset>
              ) : null}

              <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
                <legend className="col-span-full mb-1 text-sm font-semibold">Identity</legend>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-name`}>Canon name</Label>
                  <Input
                    id={`${id}-name`}
                    name="name"
                    defaultValue={initial.name}
                    required
                    maxLength={120}
                    autoComplete="off"
                  />
                </div>
                <ListField
                  id={`${id}-aliases`}
                  name="aliases"
                  label="Aliases"
                  hint="One alternate name per line"
                  values={initial.aliases}
                  maxItems={8}
                />
              </fieldset>

              <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
                <legend className="col-span-full mb-1 text-sm font-semibold">Profile</legend>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-appearance`}>{copy.appearance.label}</Label>
                  <Textarea
                    id={`${id}-appearance`}
                    name="appearance"
                    defaultValue={initial.appearance}
                    placeholder={copy.appearance.placeholder}
                    rows={4}
                    maxLength={4_000}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-background`}>{copy.background.label}</Label>
                  <Textarea
                    id={`${id}-background`}
                    name="background"
                    defaultValue={initial.background}
                    placeholder={copy.background.placeholder}
                    rows={4}
                    maxLength={4_000}
                  />
                </div>
                <ListField
                  id={`${id}-goals`}
                  name="goals"
                  label={copy.goals.label}
                  hint={copy.goals.hint}
                  values={initial.goals}
                  maxItems={24}
                />
                <ListField
                  id={`${id}-personality`}
                  name="personality"
                  label={copy.personality.label}
                  hint={copy.personality.hint}
                  values={initial.personality}
                  maxItems={24}
                />
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-voice`}>{copy.voice.label}</Label>
                  <Textarea
                    id={`${id}-voice`}
                    name="voice"
                    defaultValue={initial.voice}
                    placeholder={copy.voice.placeholder}
                    rows={3}
                    maxLength={2_000}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-arc`}>{copy.arc.label}</Label>
                  <Textarea
                    id={`${id}-arc`}
                    name="arc"
                    defaultValue={initial.arc}
                    placeholder={copy.arc.placeholder}
                    rows={3}
                    maxLength={4_000}
                  />
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-facts`}>Established facts</Label>
                <Textarea
                  id={`${id}-facts`}
                  name="facts"
                  defaultValue={initial.facts.join("\n")}
                  rows={5}
                  maxLength={50_100}
                  aria-describedby={`${id}-facts-hint`}
                />
                <p id={`${id}-facts-hint`} className="text-xs leading-5 text-muted-foreground">
                  One concrete fact per line. Removing a line removes that fact from canon; other
                  generated profile details remain intact.
                </p>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-sm border border-destructive/40 p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border bg-popover px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
              <Button
                type="button"
                variant="outline"
                aria-disabled={pending}
                className={cn(pending && "opacity-50")}
                onClick={() => {
                  if (!pending) setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                aria-busy={pending || undefined}
                aria-disabled={pending}
                className={cn(pending && "opacity-50")}
              >
                {pending ? "Saving canon…" : editing ? "Save canon" : "Add to Story Bible"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
