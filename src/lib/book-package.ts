import { z } from "zod";

/**
 * The author-owned material that surrounds the numbered chapters.
 *
 * This deliberately lives in the existing `books.front_matter` JSON column:
 * historical books keep working, cover metadata remains intact, and adding a
 * new optional page never requires rewriting a manuscript document.
 */
export const bookMatterSchema = z.object({
  subtitle: z.string().max(300).optional(),
  author: z.string().max(200).optional(),
  dedication: z.string().max(2_000).optional(),
  epigraphText: z.string().max(2_000).optional(),
  epigraphAttribution: z.string().max(300).optional(),
  copyrightYear: z.number().int().min(1000).max(9999).optional(),
  copyrightHolder: z.string().max(300).optional(),
  publisher: z.string().max(300).optional(),
  isbn: z.string().max(40).optional(),
  editionName: z.string().max(120).optional(),
  foreword: z.string().max(20_000).optional(),
  preface: z.string().max(20_000).optional(),
  introduction: z.string().max(20_000).optional(),
  afterword: z.string().max(20_000).optional(),
  acknowledgments: z.string().max(20_000).optional(),
  authorNote: z.string().max(20_000).optional(),
  aboutAuthor: z.string().max(20_000).optional(),
  /** Existing generated-cover metadata. It is preserved by book-matter saves. */
  coverUrl: z.string().url().optional(),
});

export type BookMatter = z.infer<typeof bookMatterSchema>;

export type BookMatterSection = {
  key:
    | "foreword"
    | "preface"
    | "introduction"
    | "afterword"
    | "acknowledgments"
    | "authorNote"
    | "aboutAuthor";
  title: string;
  markdown: string;
};

const OPENING_SECTIONS: Array<{
  key: BookMatterSection["key"];
  title: string;
}> = [
  { key: "foreword", title: "Foreword" },
  { key: "preface", title: "Preface" },
  { key: "introduction", title: "Introduction" },
];

const CLOSING_SECTIONS: Array<{
  key: BookMatterSection["key"];
  title: string;
}> = [
  { key: "afterword", title: "Afterword" },
  { key: "authorNote", title: "Author's note" },
  { key: "acknowledgments", title: "Acknowledgments" },
  { key: "aboutAuthor", title: "About the author" },
];

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Tolerant reader for historical JSON and partial saves. */
export function readBookMatter(value: unknown): BookMatter {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const candidate = {
    subtitle: clean(raw.subtitle),
    author: clean(raw.author),
    dedication: clean(raw.dedication),
    epigraphText: clean(raw.epigraphText),
    epigraphAttribution: clean(raw.epigraphAttribution),
    copyrightYear:
      typeof raw.copyrightYear === "number" && Number.isInteger(raw.copyrightYear)
        ? raw.copyrightYear
        : undefined,
    copyrightHolder: clean(raw.copyrightHolder),
    publisher: clean(raw.publisher),
    isbn: clean(raw.isbn),
    editionName: clean(raw.editionName),
    foreword: clean(raw.foreword),
    preface: clean(raw.preface),
    introduction: clean(raw.introduction),
    afterword: clean(raw.afterword),
    acknowledgments: clean(raw.acknowledgments),
    authorNote: clean(raw.authorNote),
    aboutAuthor: clean(raw.aboutAuthor),
    coverUrl: clean(raw.coverUrl),
  };
  const complete = bookMatterSchema.partial().safeParse(candidate);
  if (complete.success) return complete.data;

  // One malformed historical key must not erase otherwise valid author
  // matter or make a reading/export route throw. Validate keys independently
  // and omit only the incompatible value.
  const compatible: Partial<BookMatter> = {};
  for (const [key, candidateValue] of Object.entries(candidate) as Array<
    [keyof BookMatter, unknown]
  >) {
    if (candidateValue === undefined) continue;
    const field = bookMatterSchema.shape[key].safeParse(candidateValue);
    if (field.success) {
      Object.assign(compatible, { [key]: field.data });
    }
  }
  return compatible;
}

function sections(
  matter: BookMatter,
  definitions: Array<{ key: BookMatterSection["key"]; title: string }>,
): BookMatterSection[] {
  return definitions.flatMap(({ key, title }) => {
    const markdown = matter[key];
    return typeof markdown === "string" && markdown.trim()
      ? [{ key, title, markdown: markdown.trim() }]
      : [];
  });
}

export function openingBookMatter(matter: BookMatter): BookMatterSection[] {
  return sections(matter, OPENING_SECTIONS);
}

export function closingBookMatter(matter: BookMatter): BookMatterSection[] {
  return sections(matter, CLOSING_SECTIONS);
}

export function bookMatterPageCount(matter: BookMatter): number {
  return (
    1 +
    Number(Boolean(matter.copyrightHolder || matter.publisher || matter.isbn)) +
    Number(Boolean(matter.dedication)) +
    Number(Boolean(matter.epigraphText)) +
    openingBookMatter(matter).length +
    closingBookMatter(matter).length
  );
}
