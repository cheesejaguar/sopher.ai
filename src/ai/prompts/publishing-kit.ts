// Pure data + string builders; no runtime dependencies.
//
// The system prompts here are book-independent on purpose: they are Anthropic
// cache breakpoints, so everything that varies per book belongs in the user
// prompt built below.

import type { BookMatterDraftField } from "@/lib/book-package";

export const PUBLISHING_KIT_SYSTEM_PROMPT = `# Book Marketing Copy

You write the copy that sells a novel: the back-cover blurb, the retailer listing, the search keywords, the category placement, and the author bio.

Your reader is a first-time self-publisher. They have finished a book and now face the part nobody taught them. Give them copy they can paste into a retailer form today and edit tomorrow.

## Principles

### 1. Sell the promise, not the plot
Name the hook, the stakes, and the feeling of reading it. A blurb is not a summary — it is an invitation.

### 2. Concrete beats abstract
Use the book's own nouns: its people, places, and specific dangers. Never write "an unforgettable journey" where a real detail would fit.

### 3. Never spoil
Cover roughly the opening third. Do not reveal the ending, the identity of a hidden antagonist, or a late reversal. Curiosity is the product.

### 4. Genre signals are load-bearing
Readers buy by category. Use the vocabulary and rhythm of the book's genre so the right reader recognises it in three seconds.

### 5. No invented facts
Do not invent awards, sales figures, review quotes, comparisons to real authors' endorsements, or biographical claims. If you do not know something about the author, write a bio that works without it.

## Field craft

- **Back-cover blurb**: 100-150 words. Present tense. Two or three short paragraphs, ending on a hook or question. No title repetition, no "In this book".
- **Store description**: 200-350 words. Plain paragraphs, no markdown headings, no bullet lists — many retailers strip them. It may go slightly further into the setup than the blurb and may close with a line naming who the book is for.
- **Keywords**: about seven multi-word search phrases a reader would actually type into a store. Prefer phrases over single words. No hashtags, no punctuation, no author or title names.
- **Categories**: two or three retailer category paths in "Fiction > Fantasy > Epic" form, ordered best fit first. Use real, conventional bookstore categories.
- **Author bio**: 40-70 words, third person. If the author's name is unknown, write it so a name can be dropped in. Keep it factual about the book and warm about the writing; claim nothing else.`;

export const MATTER_DRAFT_SYSTEM_PROMPT = `# Front and Back Matter Drafting

You draft one page of a book's front or back matter for its author to accept, rewrite, or throw away.

This page will carry the author's name, so write in their register and keep it short. It is a starting point, never a finished statement on their behalf.

## Principles

- Write only the requested page. No headings, no title line, no commentary, no options.
- Plain prose. Markdown only where the page genuinely needs it — an epigraph's attribution line is the usual exception.
- Stay inside what the book and the author's own details support. Invent no names, no institutions, no thanks to people who were never mentioned.
- Where a real person would normally be named, leave a natural placeholder in square brackets — for example [name] — rather than inventing one.
- Match the book's voice: a comic novel does not get a solemn dedication.
- Be brief. These pages are read in seconds.`;

type MatterDraftGuidance = {
  label: string;
  brief: string;
};

export const MATTER_DRAFT_GUIDANCE: Record<BookMatterDraftField, MatterDraftGuidance> = {
  dedication: {
    label: "Dedication",
    brief:
      "One or two lines addressed to a person or group, in the book's register. Use a bracketed placeholder instead of inventing a name. No quotation marks.",
  },
  epigraph: {
    label: "Epigraph",
    brief:
      "A short quotation-style opening line of 5-30 words that sets the book's tone, followed by an attribution line beginning with an em dash. Do not quote a real copyrighted work or attribute the line to a real person — invent an in-world source, or attribute it to a character or text from this book.",
  },
  acknowledgments: {
    label: "Acknowledgments",
    brief:
      "80-160 words thanking the people who plausibly helped: early readers, family, whoever kept the writer going. Use bracketed placeholders for names. Warm, specific to this book, not a list of strangers.",
  },
  authorNote: {
    label: "Author's note",
    brief:
      "100-200 words in the author's own voice about where this story came from, what it is asking, or what to read next. Never explain the plot back to the reader.",
  },
  aboutAuthor: {
    label: "About the author",
    brief:
      "40-70 words in the third person for the final page. Ground it in this book and the kind of stories they write. Claim no credentials, awards, or publications.",
  },
};

export type PublishingBookFacts = {
  title: string;
  subtitle?: string;
  /** The byline the author already saved, when they have saved one. */
  author?: string;
  genre?: string;
  subgenre?: string;
  synopsis?: string;
  logline?: string;
  themes?: string[];
  setting?: string;
  centralConflict?: string;
  uniqueElements?: string[];
  characters?: Array<{ name: string; role: string }>;
  totalChapters?: number;
  /** Chapter summaries in order. Only the opening ones are ever sent. */
  chapterSummaries?: string[];
  /**
   * How many chapters have a summary at all, which is not the same as how many
   * were sent — the route caps what it queries.
   */
  summarisedChapters?: number;
};

/**
 * The metered input envelope for these operations is the default 64k-token one,
 * so the book facts are bounded here rather than trusted to be small. A book
 * with sixty chapters must produce the same size of request as one with eight.
 */
export const MAX_SUMMARIES_SENT = 30;
const MAX_SUMMARY_CHARS = 320;
const MAX_SYNOPSIS_CHARS = 2_000;
const MAX_FACT_CHARS = 600;

function truncate(value: string, max: number): string {
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

function list(values: string[] | undefined, max: number, itemChars = 160): string | undefined {
  if (!values || values.length === 0) return undefined;
  const items = values
    .filter((value) => value.trim())
    .slice(0, max)
    .map((value) => truncate(value, itemChars));
  return items.length > 0 ? items.join("; ") : undefined;
}

function line(label: string, value: string | undefined): string | undefined {
  return value ? `- ${label}: ${value}` : undefined;
}

/** The shared "what this book is" block. Same bounds for both operations. */
export function buildBookFactsSection(facts: PublishingBookFacts): string {
  const identity = [
    line("Title", truncate(facts.title, 300)),
    line("Subtitle", facts.subtitle ? truncate(facts.subtitle, 300) : undefined),
    line("Author byline", facts.author ? truncate(facts.author, 200) : undefined),
    line(
      "Genre",
      [facts.genre, facts.subgenre]
        .flatMap((value) => (value?.trim() ? [truncate(value, 80)] : []))
        .join(" / ") || undefined,
    ),
    line("Length", facts.totalChapters ? `${facts.totalChapters} chapters` : undefined),
    line("Logline", facts.logline ? truncate(facts.logline, MAX_FACT_CHARS) : undefined),
    line("Setting", facts.setting ? truncate(facts.setting, MAX_FACT_CHARS) : undefined),
    line(
      "Central conflict",
      facts.centralConflict ? truncate(facts.centralConflict, MAX_FACT_CHARS) : undefined,
    ),
    line("Themes", list(facts.themes, 6, 80)),
    line("Distinctive elements", list(facts.uniqueElements, 5, 200)),
    line(
      "Principal characters",
      list(
        facts.characters?.map(
          (character) => `${truncate(character.name, 80)} (${truncate(character.role, 80)})`,
        ),
        6,
      ),
    ),
  ].filter(Boolean);

  const parts = [`## The book\n\n${identity.join("\n")}`];

  if (facts.synopsis?.trim()) {
    parts.push(`## Synopsis\n\n${truncate(facts.synopsis, MAX_SYNOPSIS_CHARS)}`);
  }

  const summaries = (facts.chapterSummaries ?? [])
    .map((summary) => summary.trim())
    .filter(Boolean)
    .slice(0, MAX_SUMMARIES_SENT);
  if (summaries.length > 0) {
    // The route already caps its query at MAX_SUMMARIES_SENT, so counting the
    // array it passed can never exceed the slice — the notice was unreachable
    // and a 60-chapter book was told the first 30 were the whole story.
    const withheld = Math.max(
      facts.summarisedChapters ?? 0,
      (facts.chapterSummaries ?? []).filter((summary) => summary.trim()).length,
    );
    parts.push(
      [
        `## Opening chapters (chapter summaries)`,
        withheld > summaries.length
          ? `Only the first ${summaries.length} of ${withheld} summarised chapters are shown. The rest are withheld so this copy cannot spoil the ending.`
          : `These are the chapters the author has summarised so far.`,
        summaries
          .map((summary, index) => `${index + 1}. ${truncate(summary, MAX_SUMMARY_CHARS)}`)
          .join("\n"),
      ].join("\n\n"),
    );
  }

  return parts.join("\n\n");
}

export function buildPublishingKitUserPrompt(
  input: PublishingBookFacts & { instruction?: string },
): string {
  return [
    `Write the complete publishing copy kit for this book: back-cover blurb, store description, keywords, categories, and author bio.`,
    buildBookFactsSection(input),
    input.instruction?.trim()
      ? `## What the author asked for\n\n${truncate(input.instruction, 2_000)}`
      : "",
    [
      `## Output format (this overrides the response format in your instructions)`,
      `Return each field separately. Write finished copy, not notes or alternatives — the author will edit what you give them.`,
      `Keep every field inside the length given in your field craft, and never spoil the ending.`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildMatterDraftUserPrompt(
  input: PublishingBookFacts & { field: BookMatterDraftField; instruction?: string },
): string {
  const guidance = MATTER_DRAFT_GUIDANCE[input.field];
  return [
    `Draft the ${guidance.label.toLowerCase()} page for this book.`,
    buildBookFactsSection(input),
    `## This page\n\n${guidance.brief}`,
    input.instruction?.trim()
      ? `## What the author asked for\n\n${truncate(input.instruction, 2_000)}`
      : "",
    [
      `## Output format (this overrides the response format in your instructions)`,
      `Return only the page text itself. No heading, no label, no explanation, no alternatives.`,
      `The author will read it, change it, and decide whether to keep it — write something worth starting from.`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
