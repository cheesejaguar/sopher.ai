"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Check, Copy, Loader2, Save, Sparkles } from "lucide-react";

import {
  SUSPENDED_AUTHORING_MESSAGE,
  useStudioSuspension,
} from "@/components/studio/studio-access-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BookMatter, BookMatterDraftField, PublishingKit } from "@/lib/book-package";
import { acknowledgePaidResponse, idempotentPaidFetch } from "@/lib/client/idempotent-paid-fetch";
import { updateBookPackage } from "@/lib/actions/books";

type TextField = {
  name: keyof BookMatter;
  label: string;
  help: string;
  placeholder?: string;
  rows?: number;
  /** Set when this page can be drafted for the author to accept or edit. */
  draftField?: BookMatterDraftField;
};

/** A proposed page, and the one the author has accepted into the textarea. */
type DraftState = {
  proposed?: string;
  accepted?: { text: string; attribution?: string; seq: number };
  busy?: boolean;
  error?: string;
};

type DraftControl = {
  field: BookMatterDraftField;
  label: string;
  state: DraftState;
  suspended: boolean;
  onRequest: () => void;
  onAccept: () => void;
  onDismiss: () => void;
};

const OPENING_FIELDS: TextField[] = [
  {
    name: "dedication",
    label: "Dedication",
    help: "A brief page before the story, often addressed to one person or group.",
    placeholder: "For…",
    rows: 3,
    draftField: "dedication",
  },
  {
    name: "foreword",
    label: "Foreword",
    help: "Usually written by someone other than the author. Leave blank if the book does not need one.",
    rows: 5,
  },
  {
    name: "preface",
    label: "Preface",
    help: "Tell readers why or how you made this book.",
    rows: 5,
  },
  {
    name: "introduction",
    label: "Introduction",
    help: "Orient the reader to the subject or world before chapter one.",
    rows: 5,
  },
];

const CLOSING_FIELDS: TextField[] = [
  {
    name: "afterword",
    label: "Afterword",
    help: "A closing reflection after the story ends.",
    rows: 5,
  },
  {
    name: "authorNote",
    label: "Author's note",
    help: "Context, research notes, or a final word in your own voice.",
    rows: 5,
    draftField: "authorNote",
  },
  {
    name: "acknowledgments",
    label: "Acknowledgments",
    help: "Thank the people who helped shape the work.",
    rows: 5,
    draftField: "acknowledgments",
  },
  {
    name: "aboutAuthor",
    label: "About the author",
    help: "A short biography for the final page and reader editions.",
    rows: 5,
    draftField: "aboutAuthor",
  },
];

const KIT_BLOCKS: Array<{ key: "blurb" | "storeDescription" | "authorBio"; label: string }> = [
  { key: "blurb", label: "Back-cover blurb" },
  { key: "storeDescription", label: "Store description" },
  { key: "authorBio", label: "Author bio" },
];

/**
 * A drafted page is never written into the form on its own. It is shown first,
 * and only replaces what the author has in the field when they say so.
 */
function MatterDraft({ control }: { control: DraftControl }) {
  const { state } = control;
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={control.onRequest}
        disabled={state.busy || control.suspended}
        aria-busy={state.busy || undefined}
      >
        {state.busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        {state.busy ? "Drafting…" : `Draft a ${control.label.toLowerCase()}`}
      </Button>
      {state.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.proposed ? (
        <div className="space-y-3 rounded-md border border-ai/40 bg-ai-soft/50 p-3">
          <p className="folio-label text-ai">Suggested {control.label.toLowerCase()}</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{state.proposed}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={control.onAccept}>
              Use this draft
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={control.onDismiss}>
              Discard
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Using it only fills the field. Nothing replaces your page until you save.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function MatterTextarea({
  field,
  value,
  draft,
}: {
  field: TextField;
  value?: string;
  draft?: DraftControl;
}) {
  const id = `book-${field.name}`;
  const helpId = `${id}-help`;
  const accepted = draft?.state.accepted;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Textarea
        // Remounting is how an accepted draft reaches an uncontrolled field.
        key={accepted?.seq ?? 0}
        id={id}
        name={field.name}
        defaultValue={accepted?.text ?? value ?? ""}
        rows={field.rows ?? 4}
        maxLength={20_000}
        placeholder={field.placeholder}
        aria-describedby={helpId}
      />
      <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
        {field.help}
      </p>
      {draft ? <MatterDraft control={draft} /> : null}
    </div>
  );
}

function CopyableCopy({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard permission is not something to interrupt the author over —
      // the text is on screen and selectable either way.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="folio-label text-muted-foreground">{label}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function CopyableList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <h3 className="folio-label text-muted-foreground">{label}</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item} className="rounded-sm bg-muted px-2 py-1 text-xs text-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BookPackageForm({
  projectId,
  title,
  synopsis,
  matter,
}: {
  projectId: string;
  title: string;
  synopsis: string | null;
  matter: BookMatter;
}) {
  const suspended = useStudioSuspension();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kit, setKit] = useState<Partial<PublishingKit> | undefined>(matter.publishingKit);
  const [kitBusy, setKitBusy] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<BookMatterDraftField, DraftState>>>({});
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const confirmedNavigationRef = useRef(false);

  function setFormDirty(nextDirty: boolean) {
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
  }

  function markDirty() {
    revisionRef.current += 1;
    setFormDirty(true);
    setSaved(false);
    setError(null);
  }

  useEffect(() => {
    const confirmLeave = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download"))
        return;

      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      const isSameDocument =
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search;
      if (isSameDocument) return;

      if (!window.confirm("Leave this page? Your unsaved book package changes will be lost.")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      // A confirmed full-page navigation can synchronously emit beforeunload.
      // Suppress that duplicate prompt without forgetting the dirty state if
      // another handler ultimately cancels the navigation.
      confirmedNavigationRef.current = true;
      window.setTimeout(() => {
        confirmedNavigationRef.current = false;
      }, 0);
    };
    const confirmReload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || confirmedNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("click", confirmLeave, true);
    window.addEventListener("beforeunload", confirmReload);
    return () => {
      document.removeEventListener("click", confirmLeave, true);
      window.removeEventListener("beforeunload", confirmReload);
    };
  }, []);

  async function requestPublishingCopy(
    body: { kind: "kit" } | { kind: "matter"; field: BookMatterDraftField },
  ) {
    const response = await idempotentPaidFetch(`/api/projects/${projectId}/publishing-kit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: unknown;
      kit?: Partial<PublishingKit>;
      text?: string;
    };
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string" ? payload.error : "Could not write that copy",
      );
    }
    return { response, payload };
  }

  async function generateKit() {
    if (kitBusy || suspended) return;
    setKitBusy(true);
    setKitError(null);
    try {
      const { response, payload } = await requestPublishingCopy({ kind: "kit" });
      if (!payload.kit) throw new Error("The copy kit came back empty. Try again.");
      setKit(payload.kit);
      acknowledgePaidResponse(response);
    } catch (failure) {
      setKitError(
        failure instanceof Error ? failure.message : "Could not write the publishing copy",
      );
    } finally {
      setKitBusy(false);
    }
  }

  async function draftMatter(field: BookMatterDraftField) {
    if (suspended || drafts[field]?.busy) return;
    setDrafts((previous) => ({
      ...previous,
      [field]: { ...previous[field], busy: true, error: undefined },
    }));
    try {
      const { response, payload } = await requestPublishingCopy({ kind: "matter", field });
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) throw new Error("The draft came back empty. Try again.");
      setDrafts((previous) => ({
        ...previous,
        [field]: { ...previous[field], busy: false, proposed: text },
      }));
      acknowledgePaidResponse(response);
    } catch (failure) {
      setDrafts((previous) => ({
        ...previous,
        [field]: {
          ...previous[field],
          busy: false,
          error: failure instanceof Error ? failure.message : "Could not draft that page",
        },
      }));
    }
  }

  function acceptDraft(field: BookMatterDraftField) {
    setDrafts((previous) => {
      const state = previous[field];
      if (!state?.proposed) return previous;
      // An epigraph arrives as its line plus an attribution; the book stores
      // those separately, so split them here rather than making the author do it.
      const lines = state.proposed.split("\n").map((part) => part.trim());
      const last = lines.at(-1) ?? "";
      const isAttribution = field === "epigraph" && lines.length > 1 && /^[—–-]/.test(last);
      return {
        ...previous,
        [field]: {
          accepted: {
            text: (isAttribution ? lines.slice(0, -1) : lines).join("\n").trim(),
            ...(isAttribution ? { attribution: last.replace(/^[—–-]+\s*/, "") } : {}),
            seq: (state.accepted?.seq ?? 0) + 1,
          },
        },
      };
    });
    markDirty();
  }

  function dismissDraft(field: BookMatterDraftField) {
    setDrafts((previous) => ({
      ...previous,
      [field]: { ...previous[field], proposed: undefined },
    }));
  }

  function draftControl(field: BookMatterDraftField, label: string): DraftControl {
    return {
      field,
      label,
      state: drafts[field] ?? {},
      suspended,
      onRequest: () => void draftMatter(field),
      onAccept: () => acceptDraft(field),
      onDismiss: () => dismissDraft(field),
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const year = text("copyrightYear");
    const submittedRevision = revisionRef.current;
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await updateBookPackage(projectId, {
          title: text("title"),
          synopsis: text("synopsis"),
          subtitle: text("subtitle"),
          author: text("author"),
          dedication: text("dedication"),
          epigraphText: text("epigraphText"),
          epigraphAttribution: text("epigraphAttribution"),
          copyrightYear: year ? Number(year) : undefined,
          copyrightHolder: text("copyrightHolder"),
          publisher: text("publisher"),
          isbn: text("isbn"),
          editionName: text("editionName"),
          foreword: text("foreword"),
          preface: text("preface"),
          introduction: text("introduction"),
          afterword: text("afterword"),
          acknowledgments: text("acknowledgments"),
          authorNote: text("authorNote"),
          aboutAuthor: text("aboutAuthor"),
        });
        if (revisionRef.current === submittedRevision) {
          setFormDirty(false);
          setSaved(true);
        }
      } catch {
        setFormDirty(true);
        setSaved(false);
        setError("The book package could not be saved. Check the fields and try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} onChange={markDirty} className="space-y-10">
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.75rem)] z-10 flex flex-wrap items-center gap-3 border border-border bg-background p-3 shadow-lg md:top-3">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending || undefined}>
          {saved && !dirty && !pending ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
          {pending
            ? "Saving book package…"
            : saved && !dirty
              ? "Saved"
              : dirty
                ? "Save changes"
                : "Save book package"}
        </Button>
        <div className="min-h-5 text-sm" aria-live="polite">
          {saved && !dirty && !pending ? (
            <p className="text-success">
              Saved. New exports and reader editions will include these details.
            </p>
          ) : null}
          {dirty && !pending && !error ? (
            <p className="text-muted-foreground">Unsaved changes</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="identity-heading" className="space-y-5 border-b border-border pb-9">
        <div>
          <h2 id="identity-heading" className="text-lg font-semibold tracking-tight">
            Identity and title page
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            These details lead every reader edition and flow into every export.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="book-title">Title</Label>
            <Input id="book-title" name="title" defaultValue={title} required maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-subtitle">Subtitle</Label>
            <Input
              id="book-subtitle"
              name="subtitle"
              defaultValue={matter.subtitle ?? ""}
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-author">Author byline</Label>
            <Input
              id="book-author"
              name="author"
              defaultValue={matter.author ?? ""}
              maxLength={200}
              placeholder="Your name or pen name"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="book-synopsis">Synopsis</Label>
            <Textarea
              id="book-synopsis"
              name="synopsis"
              defaultValue={synopsis ?? ""}
              maxLength={2_000}
              rows={4}
              aria-describedby="book-synopsis-help"
            />
            <p id="book-synopsis-help" className="text-xs text-muted-foreground">
              Used as edition metadata and the book description, not as a page inside the story.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="rights-heading" className="space-y-5 border-b border-border pb-9">
        <div>
          <h2 id="rights-heading" className="text-lg font-semibold tracking-tight">
            Edition and rights page
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Optional publication details. They are included only when you provide them.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="book-edition">Edition name</Label>
            <Input
              id="book-edition"
              name="editionName"
              defaultValue={matter.editionName ?? ""}
              maxLength={120}
              placeholder="First edition"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-publisher">Publisher or imprint</Label>
            <Input
              id="book-publisher"
              name="publisher"
              defaultValue={matter.publisher ?? ""}
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-copyright-year">Copyright year</Label>
            <Input
              id="book-copyright-year"
              name="copyrightYear"
              type="number"
              min={1000}
              max={9999}
              defaultValue={matter.copyrightYear ?? new Date().getFullYear()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-copyright-holder">Copyright holder</Label>
            <Input
              id="book-copyright-holder"
              name="copyrightHolder"
              defaultValue={matter.copyrightHolder ?? matter.author ?? ""}
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="book-isbn">ISBN</Label>
            <Input
              id="book-isbn"
              name="isbn"
              defaultValue={matter.isbn ?? ""}
              maxLength={40}
              inputMode="numeric"
              placeholder="Optional; add after your ISBN is assigned"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="opening-heading" className="space-y-6 border-b border-border pb-9">
        <div>
          <h2 id="opening-heading" className="text-lg font-semibold tracking-tight">
            Before chapter one
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Blank fields disappear entirely. The remaining pages are ordered as readers expect.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="book-epigraph">Epigraph</Label>
            <Textarea
              key={drafts.epigraph?.accepted?.seq ?? 0}
              id="book-epigraph"
              name="epigraphText"
              defaultValue={drafts.epigraph?.accepted?.text ?? matter.epigraphText ?? ""}
              rows={3}
              maxLength={2_000}
              placeholder="A quotation or line that opens the work"
            />
            <Input
              key={drafts.epigraph?.accepted?.seq ?? 0}
              name="epigraphAttribution"
              aria-label="Epigraph attribution"
              defaultValue={
                drafts.epigraph?.accepted?.attribution ?? matter.epigraphAttribution ?? ""
              }
              maxLength={300}
              placeholder="Attribution"
            />
            <MatterDraft control={draftControl("epigraph", "Epigraph")} />
          </div>
          {OPENING_FIELDS.map((field) => (
            <MatterTextarea
              key={field.name}
              field={field}
              value={matter[field.name] as string}
              {...(field.draftField ? { draft: draftControl(field.draftField, field.label) } : {})}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="closing-heading" className="space-y-6 border-b border-border pb-9">
        <div>
          <h2 id="closing-heading" className="text-lg font-semibold tracking-tight">
            After the final chapter
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Give the finished work a deliberate landing and tell readers who made it.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {CLOSING_FIELDS.map((field) => (
            <MatterTextarea
              key={field.name}
              field={field}
              value={matter[field.name] as string}
              {...(field.draftField ? { draft: draftControl(field.draftField, field.label) } : {})}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="publishing-heading" className="space-y-5">
        <div>
          <h2 id="publishing-heading" className="text-lg font-semibold tracking-tight">
            Publishing copy
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The copy a store asks for and nobody teaches you to write. Drafted from your own title,
            synopsis, and chapters — then paste it into your retailer listing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void generateKit()}
            disabled={kitBusy || suspended}
            aria-busy={kitBusy || undefined}
          >
            {kitBusy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            {kitBusy ? "Writing…" : kit ? "Write it again" : "Write my publishing copy"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Uses credits. Saved with your book as soon as it is written.
          </p>
        </div>
        {suspended ? (
          <p className="max-w-2xl text-xs text-muted-foreground">{SUSPENDED_AUTHORING_MESSAGE}</p>
        ) : null}
        {kitError ? (
          <p role="alert" className="text-sm text-destructive">
            {kitError}
          </p>
        ) : null}
        {kit ? (
          <div className="space-y-4 rounded-sm border border-border p-4" aria-live="polite">
            {KIT_BLOCKS.map(({ key, label }) =>
              kit[key] ? <CopyableCopy key={key} label={label} text={kit[key]} /> : null,
            )}
            {kit.keywords?.length ? <CopyableList label="Keywords" items={kit.keywords} /> : null}
            {kit.categories?.length ? (
              <CopyableList label="Categories" items={kit.categories} />
            ) : null}
          </div>
        ) : (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Nothing written yet. A blurb, a store description, keywords, categories, and an author
            bio arrive together.
          </p>
        )}
      </section>
    </form>
  );
}
