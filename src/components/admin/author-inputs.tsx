import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/relative-time";
import type { ProjectSettings } from "@/db/schema";

/**
 * Everything the author supplied or chose, in one place.
 *
 * The admin surface could already show a whole manuscript but not the
 * one-sentence brief that asked for it — which is exactly backwards for
 * understanding a support question or a moderation flag. The brief, the
 * settings, and the per-edit instructions are the intent; the manuscript is
 * just the consequence.
 */

type ToolRun = {
  id: string;
  toolId: string;
  input: unknown;
  createdAt: Date;
};

type Instruction = {
  id: string;
  chapterNumber: number;
  passType: string;
  status: string;
  instruction: string | null;
  createdAt: Date;
};

type Run = {
  id: string;
  kind: string;
  status: string;
  config: unknown;
  approvalNotes: string | null;
  createdAt: Date;
};

export type AuthorInputs = {
  brief: string | null;
  subgenre: string | null;
  protagonist: string | null;
  setting: string | null;
  genre: string | null;
  styleGuide: string | null;
  settings: ProjectSettings;
  targetChapters: number;
  targetWordsPerChapter: number;
  concept: unknown;
  runs: Run[];
  instructions: Instruction[];
  toolRuns: ToolRun[];
  outlines: { version: number; source: string; createdAt: Date }[];
};

const SETTING_LABELS: Record<keyof ProjectSettings, string> = {
  authoringMode: "Authoring mode",
  pov: "Point of view",
  tense: "Tense",
  tone: "Tone",
  voiceProfile: "Voice preset",
  styleProfile: "Style profile",
  heatLevel: "Heat",
  violenceLevel: "Violence",
  profanity: "Profanity",
  avoidTopics: "Avoid",
  qualityTier: "Quality tier",
  requireOutlineApproval: "Outline approval",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/** Null means "the author never supplied this", which is worth saying out loud. */
function Absent({ reason = "not set" }: { reason?: string }) {
  return <span className="text-muted-foreground italic">{reason}</span>;
}

function settingValue(value: ProjectSettings[keyof ProjectSettings]): string {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "required" : "not required";
  return String(value).replace(/_/g, " ");
}

export function AuthorInputsPanel({ inputs }: { inputs: AuthorInputs }) {
  const settingKeys = (Object.keys(SETTING_LABELS) as (keyof ProjectSettings)[]).filter(
    (key) => inputs.settings[key] !== undefined,
  );
  // The tier as of the run that actually produced this manuscript, which can
  // differ from the project's current setting if the author changed it after.
  //
  // Runs arrive newest-first, so taking the first full_book row would report a
  // failed or still-running rerun's tier rather than the one the book was
  // written at. Prefer the earliest completed run; fall back to the earliest
  // run of any status only when nothing has completed yet.
  const bookRuns = inputs.runs.filter((run) => run.kind === "full_book");
  const completedRuns = bookRuns.filter((run) => run.status === "completed");
  const bookRun = (completedRuns.length > 0 ? completedRuns : bookRuns).at(-1);
  const runTier =
    bookRun && typeof bookRun.config === "object" && bookRun.config !== null
      ? ((bookRun.config as { tier?: string }).tier ?? null)
      : null;
  const revisionNotes = inputs.runs.filter((run) => run.approvalNotes);
  const userOutline = inputs.outlines.find((outline) => outline.source === "user");

  return (
    <section aria-labelledby="author-inputs" className="space-y-5">
      <div>
        <h2 id="author-inputs" className="font-sans font-semibold">
          What the author asked for
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The brief and settings that produced this book, plus every instruction given to the editor
          afterwards.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <dl>
            <Field label="Brief">
              {inputs.brief ? (
                <p className="whitespace-pre-wrap text-pretty">{inputs.brief}</p>
              ) : (
                <Absent reason="no brief — this project was not created through the wizard" />
              )}
            </Field>
          </dl>

          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Genre">{inputs.genre ?? <Absent />}</Field>
            <Field label="Subgenre">
              {inputs.subgenre ?? <Absent reason="not recorded separately" />}
            </Field>
            <Field label="Length asked for">
              {inputs.targetChapters} chapters × {inputs.targetWordsPerChapter.toLocaleString()}{" "}
              words
            </Field>
            <Field label="Protagonist">
              {inputs.protagonist ?? <Absent reason="not recorded separately" />}
            </Field>
            <Field label="Setting">
              {inputs.setting ?? <Absent reason="not recorded separately" />}
            </Field>
            <Field label="Tier at run time">
              {runTier ? <span className="capitalize">{runTier}</span> : <Absent />}
            </Field>
          </dl>

          <dl>
            <Field label="Settings">
              {settingKeys.length === 0 ? (
                <Absent reason="all defaults" />
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {settingKeys.map((key) => (
                    <li key={key}>
                      <Badge variant="outline" className="font-normal">
                        <span className="text-muted-foreground">{SETTING_LABELS[key]}:</span>{" "}
                        {settingValue(inputs.settings[key])}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          </dl>

          <dl>
            <Field label="Style guide">
              {inputs.styleGuide ? (
                <p className="whitespace-pre-wrap text-pretty">{inputs.styleGuide}</p>
              ) : (
                <Absent reason="none — the wizard does not set one" />
              )}
            </Field>
          </dl>
        </div>
      </div>

      {revisionNotes.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-sans text-sm font-semibold">Outline revision notes</h3>
          <ul className="space-y-2">
            {revisionNotes.map((run) => (
              <li key={run.id} className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-sm whitespace-pre-wrap">{run.approvalNotes}</p>
                <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
                  <RelativeTime iso={run.createdAt.toISOString()} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {userOutline ? (
        <p className="text-sm text-muted-foreground">
          The author edited the outline by hand (version {userOutline.version}).
        </p>
      ) : null}

      {inputs.instructions.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-sans text-sm font-semibold">
            Editing instructions ({inputs.instructions.length})
          </h3>
          <ul className="space-y-1.5">
            {inputs.instructions.map((instruction) => (
              <li
                key={instruction.id}
                className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
              >
                <p className="whitespace-pre-wrap">{instruction.instruction}</p>
                <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
                  chapter {instruction.chapterNumber} · {instruction.passType} ·{" "}
                  {instruction.status} · <RelativeTime iso={instruction.createdAt.toISOString()} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No editing instructions recorded. Instructions given before this was added are not
          recoverable.
        </p>
      )}

      {inputs.toolRuns.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-sans text-sm font-semibold">Content tools</h3>
          <ul className="space-y-1.5">
            {inputs.toolRuns.map((run) => (
              <li
                key={run.id}
                className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
              >
                <p className="font-medium capitalize">{run.toolId}</p>
                <pre className="mt-1 overflow-x-auto font-mono text-[0.7rem] text-muted-foreground">
                  {JSON.stringify(run.input, null, 2).slice(0, 800)}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
