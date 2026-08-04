import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import mammoth from "mammoth";
import { z } from "zod";

import { schema, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import {
  decodeImportedText,
  detectImportFormat,
  htmlToMarkdown,
  importedBookMatter,
  splitManuscript,
  textToMarkdown,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_CHAPTERS,
  MAX_IMPORT_WORDS,
  type ImportCommitResponse,
  type ImportPreviewResponse,
} from "@/lib/import";
import { MAX_CHAPTER_CONTENT_CHARS } from "@/lib/chapter-split";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { getStudioAccess } from "@/lib/studio-access";
import { projectGenreSchema, projectTitleSchema } from "@/lib/validation/project";

/**
 * Manuscript import — the way in for an author who already has a draft.
 *
 * A route handler rather than a server action because the payload is a file:
 * server actions cap request bodies around a megabyte, and a novel in .docx is
 * comfortably past that. It is also the rare write path that costs nothing —
 * no model call, no metering, no credit authorization — so none of the paid
 * route's spend machinery applies. What it does share is the discipline:
 * authenticate, validate, check ownership, and make the write idempotent under
 * a project-authoring lock so a retried upload cannot produce two books.
 *
 * `mode=preview` parses and returns the chapter table; `mode=commit` writes it.
 * Both run the same deterministic pipeline over the same bytes, so what the
 * author confirmed is exactly what gets stored.
 */

export const maxDuration = 60;

const commitSchema = z.object({
  /** Browser-generated, scoped to the owner — the same primitive the wizard uses. */
  requestKey: z.uuid(),
  title: projectTitleSchema,
  genre: projectGenreSchema.optional(),
});

function tooLarge(): Response {
  return Response.json(
    {
      error: `That file is larger than ${Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} MB. Split the manuscript or export it as Markdown.`,
      code: "file_too_large",
    },
    { status: 413 },
  );
}

export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  try {
    await assertNotSuspended(userId);
  } catch (error) {
    if (error instanceof SuspendedError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  // Cheap rejection before anything is buffered. `file.size` is checked again
  // below, since a declared length is only a claim.
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMPORT_BYTES * 1.1) return tooLarge();

  // Parsing a multi-megabyte manuscript is the expensive part of this route,
  // and creating a project is what it leads to — the same bound the wizard's
  // submit gets.
  const limited = await rateLimit(LIMITS.bookStart, req, userId);
  if (limited.limited) return limited.response;

  const access = await getStudioAccess(userId);
  if (!access.fullBookUnlocked) {
    return Response.json(
      {
        error:
          "Importing a manuscript needs a full-book workspace. Purchase credits to unlock one.",
        code: "purchase_required",
      },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a file upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a .docx, .md or .txt file" }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) return tooLarge();

  const format = detectImportFormat(file.name, file.type);
  if (!format) {
    return Response.json(
      {
        error: "Only .docx, .md and .txt files can be imported. Save your draft as one of those.",
        code: "unsupported_format",
      },
      { status: 415 },
    );
  }

  let markdown: string;
  if (format === "docx") {
    try {
      const { value } = await mammoth.convertToHtml(
        { buffer: Buffer.from(await file.arrayBuffer()) },
        {
          // Word stores its pictures inside the file and mammoth returns them
          // as base64 by default, which would put megabytes of data URI into
          // chapter text. Emptying the src drops them at the source.
          convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
          // Explicit even though it is mammoth's default: this is the switch
          // that decides whether an uploaded document may read files off the
          // server it is being converted on.
          externalFileAccess: false,
        },
      );
      markdown = htmlToMarkdown(value);
    } catch {
      return Response.json(
        { error: "That .docx could not be read. Re-save it from Word and try again." },
        { status: 422 },
      );
    }
  } else {
    const decoded = decodeImportedText(await file.arrayBuffer());
    if (decoded === null) {
      return Response.json(
        { error: "That file is not readable text. Export your draft as .docx, .md or .txt." },
        { status: 422 },
      );
    }
    markdown = textToMarkdown(decoded, format);
  }

  const detected = splitManuscript(markdown);
  if (detected.chapters.length === 0) {
    return Response.json({ error: "That file has no text in it", code: "empty" }, { status: 422 });
  }
  if (detected.chapters.length > MAX_IMPORT_CHAPTERS) {
    return Response.json(
      {
        error: `That draft splits into ${detected.chapters.length} chapters; a book can hold ${MAX_IMPORT_CHAPTERS}. Import it in parts.`,
        code: "too_many_chapters",
        chapters: detected.chapters.length,
      },
      { status: 422 },
    );
  }
  const oversized = detected.chapters.find(
    (chapter) => chapter.markdown.length > MAX_CHAPTER_CONTENT_CHARS,
  );
  if (oversized) {
    // A file with no headings splits into one chapter, which can sail under the
    // word ceiling and still exceed what saveChapter accepts.
    return Response.json(
      {
        error: `One detected chapter is ${oversized.markdown.length.toLocaleString()} characters; the editor can hold ${MAX_CHAPTER_CONTENT_CHARS.toLocaleString()}. Add chapter headings, or split the file before importing.`,
        code: "chapter_too_large",
      },
      { status: 422 },
    );
  }
  if (detected.totalWords > MAX_IMPORT_WORDS) {
    return Response.json(
      {
        error: `That draft is ${detected.totalWords.toLocaleString()} words; the limit is ${MAX_IMPORT_WORDS.toLocaleString()}.`,
        code: "too_many_words",
      },
      { status: 422 },
    );
  }

  // The document's own title, else the filename — the author can overwrite it
  // in the confirmation step either way.
  const named = (detected.title ?? file.name.replace(/\.[a-z0-9]+$/i, "")).trim().slice(0, 200);
  const fallbackTitle = named || "Untitled manuscript";

  if (form.get("mode") !== "commit") {
    const preview: ImportPreviewResponse = {
      mode: "preview",
      title: fallbackTitle,
      strategy: detected.strategy,
      chapters: detected.chapters.map((chapter) => ({
        number: chapter.number,
        title: chapter.title,
        wordCount: chapter.wordCount,
      })),
      skipped: detected.matter.map((section) => section.title),
      totalWords: detected.totalWords,
    };
    return Response.json(preview);
  }

  const parsed = commitSchema.safeParse({
    requestKey: form.get("requestKey"),
    title: form.get("title") ?? fallbackTitle,
    genre: form.get("genre") || undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { requestKey, title, genre } = parsed.data;

  const averageWords = Math.round(detected.totalWords / detected.chapters.length);
  const committed = await withDbTransaction(async (tx) => {
    // The project is created before the lock because the lock needs its id.
    // `uq_projects_user_creation_key` is what makes that step idempotent: a
    // retried upload lands on the same project instead of a second one.
    const owned = and(
      eq(schema.projects.userId, userId),
      eq(schema.projects.creationKey, requestKey),
    );
    const [existing] = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(owned)
      .limit(1);

    let projectId = existing?.id;
    if (!projectId) {
      const [inserted] = await tx
        .insert(schema.projects)
        .values({
          userId,
          creationKey: requestKey,
          title,
          genre: genre ?? null,
          experience: "full_book",
          // Must be at least the number of chapters that exist: export
          // assembly treats this as the edition's last chapter and would
          // otherwise truncate the book the author just handed us.
          targetChapters: detected.chapters.length,
          targetWordsPerChapter: Math.min(8_000, Math.max(400, averageWords)),
          settings: {},
          // Written, but not produced here and not finished — "editing" is the
          // only status that is true of an imported draft.
          status: "editing",
        })
        .onConflictDoNothing()
        .returning({ id: schema.projects.id });
      projectId =
        inserted?.id ??
        (await tx.select({ id: schema.projects.id }).from(schema.projects).where(owned).limit(1))[0]
          ?.id;
    }
    if (!projectId) throw new Error("Imported project could not be created");

    await lockProjectAuthoring(tx, projectId);

    const [existingBook] = await tx
      .select({ id: schema.books.id })
      .from(schema.books)
      .where(eq(schema.books.projectId, projectId))
      .limit(1);
    let bookId = existingBook?.id;
    if (!bookId) {
      const [created] = await tx
        .insert(schema.books)
        .values({
          projectId,
          title,
          frontMatter: importedBookMatter(detected.matter),
        })
        .onConflictDoNothing()
        .returning({ id: schema.books.id });
      bookId =
        created?.id ??
        (
          await tx
            .select({ id: schema.books.id })
            .from(schema.books)
            .where(eq(schema.books.projectId, projectId))
            .limit(1)
        )[0]?.id;
    }
    if (!bookId) throw new Error("Imported book could not be created");
    const book = bookId;

    // Under the lock, existing chapters mean this exact upload already
    // committed. Replay it rather than writing the manuscript twice.
    const written = await tx
      .select({ id: schema.chapters.id })
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, book))
      .limit(1);
    if (written.length > 0) return { projectId, bookId: book, replayed: true };

    const inserted = await tx
      .insert(schema.chapters)
      .values(
        detected.chapters.map((chapter) => ({
          bookId: book,
          chapterNumber: chapter.number,
          title: chapter.title,
          content: chapter.markdown,
          wordCount: chapter.wordCount,
          // The author wrote it; nothing here has been through our editor.
          status: "drafted" as const,
        })),
      )
      .returning({ id: schema.chapters.id, chapterNumber: schema.chapters.chapterNumber });

    const byNumber = new Map(
      detected.chapters.map((chapter) => [chapter.number, chapter.markdown]),
    );
    await tx.insert(schema.chapterRevisions).values(
      inserted.map((chapter) => ({
        chapterId: chapter.id,
        content: byNumber.get(chapter.chapterNumber) ?? "",
        source: "import",
      })),
    );

    return { projectId, bookId, replayed: false };
  });

  revalidatePath("/studio");
  const response: ImportCommitResponse = {
    mode: "commit",
    projectId: committed.projectId,
    bookId: committed.bookId,
    chapters: detected.chapters.length,
    totalWords: detected.totalWords,
    replayed: committed.replayed,
  };
  return Response.json(response, { status: committed.replayed ? 200 : 201 });
}
