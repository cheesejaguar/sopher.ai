import { z } from "zod";

/**
 * The author-owned material that surrounds the numbered chapters.
 *
 * This deliberately lives in the existing `books.front_matter` JSON column:
 * historical books keep working, cover metadata remains intact, and adding a
 * new optional page never requires rewriting a manuscript document.
 */
/**
 * The copy that sells the finished book. It is generated from material the
 * author already owns (title, synopsis, concept, chapter summaries) and stored
 * beside the matter pages rather than in a column of its own, so an older book
 * simply has no kit yet.
 */
export const publishingKitSchema = z.object({
  blurb: z
    .string()
    .max(1_200)
    .describe("Back-cover blurb: 100-150 words, present tense, ending on a hook. No spoilers."),
  storeDescription: z
    .string()
    .max(4_000)
    .describe(
      "Longer store description for a retailer listing: 200-350 words, plain paragraphs, no markdown headings.",
    ),
  keywords: z
    .array(z.string().max(60))
    .max(10)
    .describe("Around seven search phrases a reader would actually type. No hashtags."),
  categories: z
    .array(z.string().max(120))
    .max(5)
    .describe("Two or three retailer category paths, e.g. 'Fiction > Fantasy > Epic'."),
  authorBio: z
    .string()
    .max(1_200)
    .describe("Third-person author bio of 40-70 words, written to be edited by the author."),
});

export type PublishingKit = z.infer<typeof publishingKitSchema>;

/** Matter pages a one-click draft can propose. Never written without consent. */
export const BOOK_MATTER_DRAFT_FIELDS = [
  "dedication",
  "epigraph",
  "acknowledgments",
  "authorNote",
  "aboutAuthor",
] as const;

export type BookMatterDraftField = (typeof BOOK_MATTER_DRAFT_FIELDS)[number];

/** Draft requests are named for the page; matter stores the epigraph's text. */
export const BOOK_MATTER_DRAFT_TARGET: Record<BookMatterDraftField, keyof BookMatter> = {
  dedication: "dedication",
  epigraph: "epigraphText",
  acknowledgments: "acknowledgments",
  authorNote: "authorNote",
  aboutAuthor: "aboutAuthor",
};

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
  /**
   * Generated selling copy. Partial because a historical kit may predate a
   * field, and because the author is free to keep only the parts they like.
   */
  publishingKit: publishingKitSchema.partial().optional(),
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

function cleanList(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.flatMap((entry) => {
    const text = clean(entry);
    return text ? [text] : [];
  });
  return items.length > 0 ? items.slice(0, limit) : undefined;
}

/** Tolerant reader for a stored kit; an empty or absent kit reads as undefined. */
export function readPublishingKit(value: unknown): Partial<PublishingKit> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const kit: Partial<PublishingKit> = {};
  const blurb = clean(raw.blurb);
  if (blurb) kit.blurb = blurb;
  const storeDescription = clean(raw.storeDescription);
  if (storeDescription) kit.storeDescription = storeDescription;
  const keywords = cleanList(raw.keywords, 10);
  if (keywords) kit.keywords = keywords;
  const categories = cleanList(raw.categories, 5);
  if (categories) kit.categories = categories;
  const authorBio = clean(raw.authorBio);
  if (authorBio) kit.authorBio = authorBio;
  return Object.keys(kit).length > 0 ? kit : undefined;
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
    publishingKit: readPublishingKit(raw.publishingKit),
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
