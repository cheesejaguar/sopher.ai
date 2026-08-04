/**
 * Plain-text find & replace, shared by the chapter-scoped editor bar and the
 * book-wide server action.
 *
 * Writers search for phrases, not regexes, so a literal scan is the whole
 * algorithm. It lives here rather than in either caller because the preview the
 * author approves and the write the server performs must agree exactly — a
 * character renamed in the preview and missed in the update is worse than no
 * feature at all.
 */

/**
 * `chapter_revisions.source` written before a book-wide replace.
 *
 * Lives here rather than beside the action: a "use server" module may only
 * export async functions, and a single value export there makes Next discard
 * the module's entire export surface at build time.
 */
export const BOOK_REPLACE_REVISION_SOURCE = "book-replace";

export type ReplaceOptions = {
  caseSensitive?: boolean;
  /** Only match when both sides of the hit are non-word characters. */
  wholeWord?: boolean;
};

export type MatchRange = { start: number; end: number };

/** A match with just enough surrounding prose for the author to recognise it. */
export type MatchSnippet = { before: string; match: string; after: string };

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

/**
 * Lowercases without changing string length, so match offsets stay valid in the
 * original text. A few code points (İ, ﬁ) expand when lowercased, which would
 * otherwise shift every offset after them and corrupt the replacement.
 */
function foldCase(text: string): string {
  let folded = "";
  for (const char of text) {
    const lower = char.toLowerCase();
    folded += lower.length === char.length ? lower : char;
  }
  return folded;
}

/**
 * Every non-overlapping occurrence of `query`, left to right. Offsets index
 * into `text` unchanged, whatever the case options.
 */
export function findMatchRanges(
  text: string,
  query: string,
  options: ReplaceOptions = {},
): MatchRange[] {
  if (!query || !text) return [];
  const haystack = options.caseSensitive ? text : foldCase(text);
  const needle = options.caseSensitive ? query : foldCase(query);
  if (!needle) return [];

  const ranges: MatchRange[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const end = index + needle.length;
    const boundaryOk =
      !options.wholeWord || (!isWordChar(text[index - 1]) && !isWordChar(text[end]));
    if (boundaryOk) {
      ranges.push({ start: index, end });
      // Non-overlapping, like every editor: the next search starts after the
      // match, which is also what keeps replace-all ranges disjoint.
      index = haystack.indexOf(needle, end);
    } else {
      // A rejected hit must not consume the text after it — "aa" inside "aaa"
      // can still start one character later.
      index = haystack.indexOf(needle, index + 1);
    }
  }
  return ranges;
}

export function countMatches(text: string, query: string, options: ReplaceOptions = {}): number {
  return findMatchRanges(text, query, options).length;
}

/** Splices `replacement` into every range. Ranges must be sorted and disjoint. */
export function applyRanges(text: string, ranges: MatchRange[], replacement: string): string {
  if (ranges.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const range of ranges) {
    out += text.slice(cursor, range.start) + replacement;
    cursor = range.end;
  }
  return out + text.slice(cursor);
}

export function replaceAllInText(
  text: string,
  query: string,
  replacement: string,
  options: ReplaceOptions = {},
): { text: string; replaced: number } {
  const ranges = findMatchRanges(text, query, options);
  return { text: applyRanges(text, ranges, replacement), replaced: ranges.length };
}

const SNIPPET_RADIUS = 42;
const ELLIPSIS = "…";

/**
 * Context around one match. `before`/`after` are clipped at a word boundary
 * where one is close by, so a preview row reads as prose instead of as a
 * severed word.
 */
export function snippetFor(text: string, range: MatchRange, radius = SNIPPET_RADIUS): MatchSnippet {
  const rawStart = Math.max(0, range.start - radius);
  let start = rawStart;
  if (rawStart > 0) {
    const space = text.indexOf(" ", rawStart);
    if (space !== -1 && space < range.start) start = space + 1;
  }
  const rawEnd = Math.min(text.length, range.end + radius);
  let end = rawEnd;
  if (rawEnd < text.length) {
    const space = text.lastIndexOf(" ", rawEnd);
    if (space > range.end) end = space;
  }

  const collapse = (value: string) => value.replace(/\s+/g, " ");
  return {
    before: (start > 0 ? ELLIPSIS : "") + collapse(text.slice(start, range.start)),
    match: text.slice(range.start, range.end),
    after: collapse(text.slice(range.end, end)) + (end < text.length ? ELLIPSIS : ""),
  };
}

export type ChapterText = {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  content: string;
  version: number;
};

export type ChapterReplacePreview = {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  /** The version the count was taken against — the apply guard replays it. */
  version: number;
  matchCount: number;
  snippets: MatchSnippet[];
};

const DEFAULT_SNIPPETS_PER_CHAPTER = 3;

/** Per-chapter counts plus a few snippets, for chapters that match at all. */
export function planBookReplace(
  chapters: ChapterText[],
  query: string,
  options: ReplaceOptions = {},
  snippetsPerChapter = DEFAULT_SNIPPETS_PER_CHAPTER,
): ChapterReplacePreview[] {
  const previews: ChapterReplacePreview[] = [];
  for (const chapter of chapters) {
    const ranges = findMatchRanges(chapter.content, query, options);
    if (ranges.length === 0) continue;
    previews.push({
      chapterId: chapter.chapterId,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      version: chapter.version,
      matchCount: ranges.length,
      snippets: ranges
        .slice(0, snippetsPerChapter)
        .map((range) => snippetFor(chapter.content, range)),
    });
  }
  return previews;
}

/**
 * The other producer of highlighted excerpts is Postgres: manuscript search
 * gets its context from `ts_headline` rather than from a local scan. Its
 * sentinels and parser live here beside `snippetFor` because both surfaces
 * render the same thing — matched runs the author can read — and because the
 * excerpt must reach React as data, never as HTML.
 *
 * Control characters cannot occur in manuscript prose, so splitting on them is
 * unambiguous even when the prose contains angle brackets or markdown.
 */
export const HEADLINE_START_SEL = "\u0002";
export const HEADLINE_STOP_SEL = "\u0003";

export type SearchExcerptSegment = { text: string; highlight: boolean };

export function parseHeadline(headline: string): SearchExcerptSegment[] {
  const segments: SearchExcerptSegment[] = [];
  for (const chunk of headline.split(HEADLINE_START_SEL)) {
    const stop = chunk.indexOf(HEADLINE_STOP_SEL);
    if (stop === -1) {
      // No match opened in this chunk — it is the text before the first hit.
      if (chunk) segments.push({ text: chunk, highlight: false });
      continue;
    }
    const matched = chunk.slice(0, stop);
    const trailing = chunk.slice(stop + HEADLINE_STOP_SEL.length);
    if (matched) segments.push({ text: matched, highlight: true });
    if (trailing) segments.push({ text: trailing, highlight: false });
  }
  return segments;
}

export type EntityNames = { name: string; aliases: string[] };

export type EntityRename = {
  name: string;
  aliases: string[];
  /** False when the query only appears in fields this rename does not touch. */
  changed: boolean;
};

/**
 * Which of a bible entry's names the query hits. Renaming a character means
 * renaming the canon too, and the author has to see the aliases to decide —
 * "Mara" may be the name on one entry and an alias on another.
 */
export function matchingEntityNames(
  entity: EntityNames,
  query: string,
  options: ReplaceOptions = {},
): { nameMatches: boolean; matchingAliases: string[] } {
  return {
    nameMatches: countMatches(entity.name, query, options) > 0,
    matchingAliases: entity.aliases.filter((alias) => countMatches(alias, query, options) > 0),
  };
}

/**
 * Applies the same replacement to an entry's name and aliases. Aliases that
 * collapse into the new name (or into each other) are dropped — a character
 * whose alias equals their name is a duplicate, not an alias.
 */
export function renameEntity(
  entity: EntityNames,
  query: string,
  replacement: string,
  options: ReplaceOptions = {},
): EntityRename {
  const name = replaceAllInText(entity.name, query, replacement, options);
  const seen = new Set<string>([name.text.toLocaleLowerCase()]);
  let aliasChanges = 0;
  const aliases: string[] = [];
  for (const alias of entity.aliases) {
    const renamed = replaceAllInText(alias, query, replacement, options);
    aliasChanges += renamed.replaced;
    const key = renamed.text.toLocaleLowerCase();
    if (!renamed.text || seen.has(key)) continue;
    seen.add(key);
    aliases.push(renamed.text);
  }
  return {
    name: name.text,
    aliases,
    changed: name.replaced > 0 || aliasChanges > 0 || aliases.length !== entity.aliases.length,
  };
}
