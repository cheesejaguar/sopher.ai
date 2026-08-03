"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Check, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BookMatter } from "@/lib/book-package";
import { updateBookPackage } from "@/lib/actions/books";

type TextField = {
  name: keyof BookMatter;
  label: string;
  help: string;
  placeholder?: string;
  rows?: number;
};

const OPENING_FIELDS: TextField[] = [
  {
    name: "dedication",
    label: "Dedication",
    help: "A brief page before the story, often addressed to one person or group.",
    placeholder: "For…",
    rows: 3,
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
  },
  {
    name: "acknowledgments",
    label: "Acknowledgments",
    help: "Thank the people who helped shape the work.",
    rows: 5,
  },
  {
    name: "aboutAuthor",
    label: "About the author",
    help: "A short biography for the final page and reader editions.",
    rows: 5,
  },
];

function MatterTextarea({ field, value }: { field: TextField; value?: string }) {
  const id = `book-${field.name}`;
  const helpId = `${id}-help`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Textarea
        id={id}
        name={field.name}
        defaultValue={value ?? ""}
        rows={field.rows ?? 4}
        maxLength={20_000}
        placeholder={field.placeholder}
        aria-describedby={helpId}
      />
      <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
        {field.help}
      </p>
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
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
              id="book-epigraph"
              name="epigraphText"
              defaultValue={matter.epigraphText ?? ""}
              rows={3}
              maxLength={2_000}
              placeholder="A quotation or line that opens the work"
            />
            <Input
              name="epigraphAttribution"
              aria-label="Epigraph attribution"
              defaultValue={matter.epigraphAttribution ?? ""}
              maxLength={300}
              placeholder="Attribution"
            />
          </div>
          {OPENING_FIELDS.map((field) => (
            <MatterTextarea key={field.name} field={field} value={matter[field.name] as string} />
          ))}
        </div>
      </section>

      <section aria-labelledby="closing-heading" className="space-y-6">
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
            <MatterTextarea key={field.name} field={field} value={matter[field.name] as string} />
          ))}
        </div>
      </section>
    </form>
  );
}
