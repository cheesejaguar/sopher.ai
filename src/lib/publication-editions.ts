import { createHash, createHmac } from "node:crypto";

import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema, withDbTransaction, type DbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { bookMatterSchema, type BookMatter } from "@/lib/book-package";
import { captureExportSnapshot, type ExportSnapshot } from "@/lib/export/assemble";
import type { FigureMap } from "@/lib/export/figures";

const READER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const MAX_ACTIVE_READER_SHARES_PER_PROJECT = 20;
export const MAX_READER_EDITIONS_PER_PROJECT = 100;
export const MAX_READER_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const READER_EDITION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export const readerShareTokenSchema = z.string().regex(READER_TOKEN_PATTERN);
export const readerShareIdSchema = z.uuid();
export const readerShareRequestKeySchema = z.uuid();

const publicationFigureSchema = z.object({
  svgUrl: z.url().nullable(),
  pngUrl: z.url().nullable(),
  alt: z.string().max(2_000),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export function isOwnedReaderAssetUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "public.blob.vercel-storage.com" ||
        url.hostname.endsWith(".public.blob.vercel-storage.com"))
    );
  } catch {
    return false;
  }
}

export function readerAssetKey(url: string): string {
  return createHash("sha256").update(url, "utf8").digest("hex");
}

export const publicationEditionSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.iso.datetime(),
  incomplete: z.boolean(),
  title: z.string().min(1).max(300),
  author: z.string().min(1).max(300),
  synopsis: z.string().max(20_000).nullable(),
  genre: z.string().max(300).nullable(),
  editionNote: z.string().min(1).max(300),
  matter: bookMatterSchema.partial(),
  coverUrl: z.url().nullable(),
  /** Exact project-owned Blob objects captured with this immutable edition. */
  assetUrls: z.array(z.url()).max(500),
  chapters: z
    .array(
      z.object({
        number: z.number().int().positive(),
        title: z.string().min(1).max(500),
        markdown: z.string().min(1).max(1_000_000),
        wordCount: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(60),
  figures: z.record(z.string(), publicationFigureSchema),
});

export type PublicationEditionSnapshot = z.infer<typeof publicationEditionSnapshotSchema>;

export type ReaderShareSummary = {
  id: string;
  status: "active" | "revoked" | "expired";
  label: string | null;
  allowDownload: boolean;
  incomplete: boolean;
  chapterCount: number;
  totalWords: number;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function readerLinkSecret(): string {
  const secret = process.env.READER_LINK_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "sopher-local-reader-link-secret-v1";
  throw new Error("READER_LINK_SECRET is not configured");
}

/**
 * The browser supplies only an idempotency key. The server derives a 256-bit
 * bearer secret with an application secret, so a caller cannot choose a weak
 * public URL and a response-loss retry reproduces the same one-time link.
 */
export function readerTokenForRequest(input: {
  secret: string;
  userId: string;
  projectId: string;
  requestKey: string;
}): string {
  readerShareRequestKeySchema.parse(input.requestKey);
  return createHmac("sha256", input.secret)
    .update(`reader-share:v1\0${input.userId}\0${input.projectId}\0${input.requestKey}`, "utf8")
    .digest("base64url");
}

function serializableFigures(
  figures: FigureMap,
  allowedAssetUrls: ReadonlySet<string>,
): PublicationEditionSnapshot["figures"] {
  return Object.fromEntries(
    Object.entries(figures)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, figure]) => [
        key,
        {
          svgUrl:
            isOwnedReaderAssetUrl(figure.svgUrl) && allowedAssetUrls.has(figure.svgUrl)
              ? figure.svgUrl
              : null,
          pngUrl:
            isOwnedReaderAssetUrl(figure.pngUrl) && allowedAssetUrls.has(figure.pngUrl)
              ? figure.pngUrl
              : null,
          alt: figure.alt,
          ...(figure.width ? { width: figure.width } : {}),
          ...(figure.height ? { height: figure.height } : {}),
        },
      ]),
  );
}

const MARKDOWN_IMAGE_URL = /!\[[^\]]*\]\(\s*(https:\/\/[^\s)]+)(?:\s+[^)]*)?\)/g;

function referencedAssetUrls(snapshot: ExportSnapshot): Set<string> {
  const urls = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value) urls.add(value);
  };
  add(snapshot.manuscript.coverUrl);
  for (const figure of Object.values(snapshot.manuscript.figures)) {
    add(figure.svgUrl);
    add(figure.pngUrl);
  }
  const markdownValues = [
    ...snapshot.manuscript.chapters.map((chapter) => chapter.markdown),
    ...Object.values(snapshot.manuscript.matter).filter(
      (value): value is string => typeof value === "string",
    ),
  ];
  for (const markdown of markdownValues) {
    for (const match of markdown.matchAll(MARKDOWN_IMAGE_URL)) add(match[1]);
  }
  return urls;
}

export function publicationSnapshot(
  snapshot: ExportSnapshot,
  projectAssetUrls: ReadonlySet<string>,
): PublicationEditionSnapshot {
  const manuscript = snapshot.manuscript;
  const referenced = referencedAssetUrls(snapshot);
  const allowedAssetUrls = new Set(
    [...projectAssetUrls].filter((url) => referenced.has(url) && isOwnedReaderAssetUrl(url)),
  );
  return publicationEditionSnapshotSchema.parse({
    schemaVersion: 1,
    capturedAt: snapshot.capturedAt,
    incomplete: snapshot.incomplete,
    title: manuscript.title,
    author: manuscript.author,
    synopsis: manuscript.synopsis,
    genre: manuscript.genre,
    editionNote: manuscript.editionNote,
    matter: manuscript.matter,
    coverUrl:
      isOwnedReaderAssetUrl(manuscript.coverUrl) && allowedAssetUrls.has(manuscript.coverUrl)
        ? manuscript.coverUrl
        : null,
    assetUrls: [...allowedAssetUrls].sort(),
    chapters: manuscript.chapters,
    figures: serializableFigures(manuscript.figures, allowedAssetUrls),
  });
}

/** Captured-at is metadata, not content; unchanged books reuse one edition. */
export function publicationSourceDigest(snapshot: PublicationEditionSnapshot): string {
  const content = { ...snapshot } as Partial<PublicationEditionSnapshot>;
  delete content.capturedAt;
  return createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex");
}

/** Approved upstream assets referenced by one immutable edition. */
export function publicationAssetUrls(snapshot: PublicationEditionSnapshot): Map<string, string> {
  const urls = new Map<string, string>();
  for (const value of snapshot.assetUrls) {
    if (isOwnedReaderAssetUrl(value)) urls.set(readerAssetKey(value), value);
  }
  return urls;
}

export function readerFigureMap(
  snapshot: PublicationEditionSnapshot,
  readerBasePath = "/r",
): FigureMap {
  return Object.fromEntries(
    Object.entries(snapshot.figures).map(([key, figure]) => [
      key,
      {
        ...figure,
        svgUrl: figure.svgUrl ? `${readerBasePath}/assets/${readerAssetKey(figure.svgUrl)}` : null,
        pngUrl: figure.pngUrl ? `${readerBasePath}/assets/${readerAssetKey(figure.pngUrl)}` : null,
      },
    ]),
  );
}

function expiration(choice: "7d" | "30d" | "never", now: Date): Date | null {
  if (choice === "never") return null;
  const days = choice === "7d" ? 7 : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);
}

class ReaderShareRetryError extends Error {}

function databaseErrorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
    const value = current as { code?: unknown; cause?: unknown };
    if (typeof value.code === "string") return value.code;
    current = value.cause;
  }
  return null;
}

/**
 * The edition must reflect one real database snapshot even while an editor is
 * autosaving. Serializable isolation supplies that snapshot; bounded retries
 * make advisory-lock waiters and PostgreSQL SSI conflicts reattach safely.
 */
async function withReaderShareTransaction<T>(
  callback: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await withDbTransaction(callback, {
        isolationLevel: "serializable",
        accessMode: "read write",
      });
    } catch (error) {
      lastError = error;
      const code = databaseErrorCode(error);
      const retryable =
        error instanceof ReaderShareRetryError || code === "40001" || code === "40P01";
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw lastError;
}

async function scheduleCollectableReaderCovers(userId: string, projectId: string): Promise<void> {
  const candidates = await getDb()
    .select({ id: schema.assets.id, pathname: schema.assets.blobPathname })
    .from(schema.assets)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.assets.projectId))
    .where(
      and(
        eq(schema.assets.projectId, projectId),
        eq(schema.projects.userId, userId),
        eq(schema.assets.kind, "cover"),
        sql`not exists (
          select 1 from books
          where books.project_id = ${projectId}
            and books.front_matter->>'coverUrl' = ${schema.assets.blobUrl}
        )`,
        sql`not exists (
          select 1 from publication_editions
          where publication_editions.project_id = ${projectId}
            and publication_editions.snapshot->'assetUrls' ? ${schema.assets.blobUrl}
        )`,
      ),
    )
    .limit(25);
  if (candidates.length === 0) return;
  const { scheduleReplacedAssetCleanup } = await import("@/lib/blob-cleanup");
  await Promise.all(
    candidates.map((candidate) =>
      scheduleReplacedAssetCleanup({
        projectId,
        assetId: candidate.id,
        pathname: candidate.pathname,
      }),
    ),
  );
}

export async function createReaderShare(input: {
  userId: string;
  projectId: string;
  requestKey: string;
  label?: string;
  expires: "7d" | "30d" | "never";
  allowDownload: boolean;
}): Promise<
  | { outcome: "created"; share: ReaderShareSummary; token: string }
  | { outcome: "missing" }
  | { outcome: "empty" }
  | { outcome: "limit" }
  | { outcome: "storage_limit" }
  | { outcome: "too_large" }
> {
  const token = readerTokenForRequest({
    secret: readerLinkSecret(),
    userId: input.userId,
    projectId: input.projectId,
    requestKey: input.requestKey,
  });
  const label = input.label?.trim() || null;
  if (label && label.length > 120) throw new Error("Share label is too long");
  const digest = tokenHash(token);
  const now = new Date();

  const result = await withReaderShareTransaction(async (tx) => {
    // This lock serializes reader-link identity, retention, and quota checks.
    // Serializable isolation independently keeps the multi-query manuscript
    // capture coherent with author edits that do not take this lock.
    await lockProjectAuthoring(tx, input.projectId);

    // The server-derived token doubles as the durable request identity. Replay
    // always reattaches to the original immutable edition.
    const [existing] = await tx
      .select({ share: schema.readerShares, edition: schema.publicationEditions })
      .from(schema.readerShares)
      .innerJoin(
        schema.publicationEditions,
        eq(schema.publicationEditions.id, schema.readerShares.editionId),
      )
      .where(
        and(
          eq(schema.readerShares.tokenHash, digest),
          eq(schema.readerShares.projectId, input.projectId),
          eq(schema.readerShares.userId, input.userId),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        outcome: "created" as const,
        token,
        share: shareSummary(existing),
      };
    }

    const retentionCutoff = new Date(now.getTime() - READER_EDITION_RETENTION_MS);
    await tx.execute(sql`
      delete from reader_shares
      where project_id = ${input.projectId}
        and user_id = ${input.userId}
        and (
          (status = 'revoked' and revoked_at < ${retentionCutoff})
          or (expires_at is not null and expires_at < ${retentionCutoff})
        )
    `);
    await tx.execute(sql`
      delete from publication_editions as edition
      where edition.project_id = ${input.projectId}
        and edition.user_id = ${input.userId}
        and not exists (
          select 1 from reader_shares as share where share.edition_id = edition.id
        )
    `);

    const exportSnapshot = await captureExportSnapshot(tx, input.userId, input.projectId);
    if (!exportSnapshot) return { outcome: "missing" as const };
    if (exportSnapshot.manuscript.chapters.length === 0) return { outcome: "empty" as const };

    const [book] = await tx
      .select({ id: schema.books.id })
      .from(schema.books)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.userId, input.userId)))
      .limit(1);
    if (!book) return { outcome: "missing" as const };

    const assetRows = await tx
      .select({ blobUrl: schema.assets.blobUrl, contentType: schema.assets.contentType })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.projectId, input.projectId),
          inArray(schema.assets.kind, ["cover", "illustration", "diagram"]),
        ),
      );
    const projectAssetUrls = new Set(
      assetRows
        .filter(
          (asset) => asset.contentType.startsWith("image/") && isOwnedReaderAssetUrl(asset.blobUrl),
        )
        .map((asset) => asset.blobUrl),
    );
    const snapshot = publicationSnapshot(exportSnapshot, projectAssetUrls);
    if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > MAX_READER_SNAPSHOT_BYTES) {
      return { outcome: "too_large" as const };
    }
    const sourceDigest = publicationSourceDigest(snapshot);
    let [edition] = await tx
      .select()
      .from(schema.publicationEditions)
      .where(
        and(
          eq(schema.publicationEditions.projectId, input.projectId),
          eq(schema.publicationEditions.userId, input.userId),
          eq(schema.publicationEditions.sourceDigest, sourceDigest),
        ),
      )
      .limit(1);
    if (!edition) {
      const [editionCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.publicationEditions)
        .where(
          and(
            eq(schema.publicationEditions.projectId, input.projectId),
            eq(schema.publicationEditions.userId, input.userId),
          ),
        );
      if ((editionCount?.count ?? 0) >= MAX_READER_EDITIONS_PER_PROJECT) {
        return { outcome: "storage_limit" as const };
      }
      [edition] = await tx
        .insert(schema.publicationEditions)
        .values({
          projectId: input.projectId,
          bookId: book.id,
          userId: input.userId,
          sourceDigest,
          snapshot,
          incomplete: snapshot.incomplete,
          chapterCount: snapshot.chapters.length,
          totalWords: snapshot.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        })
        .onConflictDoNothing({
          target: [schema.publicationEditions.projectId, schema.publicationEditions.sourceDigest],
        })
        .returning();
    }
    if (!edition) {
      throw new ReaderShareRetryError("Reader edition capture raced an identical snapshot");
    }

    const [activeShareCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.readerShares)
      .where(
        and(
          eq(schema.readerShares.projectId, input.projectId),
          eq(schema.readerShares.userId, input.userId),
          eq(schema.readerShares.status, "active"),
          isNull(schema.readerShares.revokedAt),
          or(isNull(schema.readerShares.expiresAt), gt(schema.readerShares.expiresAt, now)),
        ),
      );
    if ((activeShareCount?.count ?? 0) >= MAX_ACTIVE_READER_SHARES_PER_PROJECT) {
      return { outcome: "limit" as const };
    }

    const [share] = await tx
      .insert(schema.readerShares)
      .values({
        editionId: edition.id,
        projectId: input.projectId,
        userId: input.userId,
        tokenHash: digest,
        label,
        allowDownload: input.allowDownload,
        expiresAt: expiration(input.expires, now),
      })
      .onConflictDoNothing({ target: schema.readerShares.tokenHash })
      .returning();
    // A concurrent same-request transaction may have committed after this
    // serializable snapshot began. Restart so the replay can observe it.
    if (!share) throw new ReaderShareRetryError("Reader link replay raced its first response");

    return {
      outcome: "created" as const,
      token,
      share: shareSummary({ share, edition }),
    };
  });
  // Edition retention cleanup can make a previously displaced cover
  // collectible. Schedule deletion only after the serializable commit.
  await scheduleCollectableReaderCovers(input.userId, input.projectId);
  return result;
}

function shareSummary(input: {
  share: typeof schema.readerShares.$inferSelect;
  edition: Pick<
    typeof schema.publicationEditions.$inferSelect,
    "incomplete" | "chapterCount" | "totalWords"
  >;
}): ReaderShareSummary {
  const expired = input.share.expiresAt !== null && input.share.expiresAt <= new Date();
  return {
    id: input.share.id,
    status: input.share.status === "revoked" ? "revoked" : expired ? "expired" : "active",
    label: input.share.label,
    allowDownload: input.share.allowDownload,
    incomplete: input.edition.incomplete,
    chapterCount: input.edition.chapterCount,
    totalWords: input.edition.totalWords,
    createdAt: input.share.createdAt.toISOString(),
    expiresAt: input.share.expiresAt?.toISOString() ?? null,
    revokedAt: input.share.revokedAt?.toISOString() ?? null,
  };
}

export async function listReaderShares(
  userId: string,
  projectId: string,
): Promise<ReaderShareSummary[] | null> {
  const db = getDb();
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return null;

  const rows = await db
    .select({ share: schema.readerShares, edition: schema.publicationEditions })
    .from(schema.readerShares)
    .innerJoin(
      schema.publicationEditions,
      eq(schema.publicationEditions.id, schema.readerShares.editionId),
    )
    .where(
      and(
        eq(schema.readerShares.projectId, projectId),
        eq(schema.readerShares.userId, userId),
        eq(schema.readerShares.status, "active"),
        isNull(schema.readerShares.revokedAt),
        or(isNull(schema.readerShares.expiresAt), gt(schema.readerShares.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(schema.readerShares.createdAt))
    .limit(20);
  return rows.map(shareSummary);
}

export async function revokeReaderShare(input: {
  userId: string;
  projectId: string;
  shareId: string;
}): Promise<boolean> {
  const db = getDb();
  const [share] = await db
    .update(schema.readerShares)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(
      and(
        eq(schema.readerShares.id, input.shareId),
        eq(schema.readerShares.projectId, input.projectId),
        eq(schema.readerShares.userId, input.userId),
        eq(schema.readerShares.status, "active"),
      ),
    )
    .returning({ id: schema.readerShares.id });
  if (share) return true;
  const [alreadyRevoked] = await db
    .select({ id: schema.readerShares.id })
    .from(schema.readerShares)
    .where(
      and(
        eq(schema.readerShares.id, input.shareId),
        eq(schema.readerShares.projectId, input.projectId),
        eq(schema.readerShares.userId, input.userId),
        eq(schema.readerShares.status, "revoked"),
      ),
    )
    .limit(1);
  return Boolean(alreadyRevoked);
}

export async function loadReaderEdition(token: string): Promise<{
  shareId: string;
  allowDownload: boolean;
  snapshot: PublicationEditionSnapshot;
} | null> {
  const parsed = readerShareTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const [row] = await getDb()
    .select({
      shareId: schema.readerShares.id,
      allowDownload: schema.readerShares.allowDownload,
      snapshot: schema.publicationEditions.snapshot,
    })
    .from(schema.readerShares)
    .innerJoin(
      schema.publicationEditions,
      eq(schema.publicationEditions.id, schema.readerShares.editionId),
    )
    .where(
      and(
        eq(schema.readerShares.tokenHash, tokenHash(parsed.data)),
        eq(schema.readerShares.status, "active"),
        isNull(schema.readerShares.revokedAt),
        or(isNull(schema.readerShares.expiresAt), gt(schema.readerShares.expiresAt, new Date())),
      ),
    )
    .limit(1);
  if (!row) return null;
  const snapshot = publicationEditionSnapshotSchema.safeParse(row.snapshot);
  return snapshot.success
    ? { shareId: row.shareId, allowDownload: row.allowDownload, snapshot: snapshot.data }
    : null;
}

export function publicationMatter(snapshot: PublicationEditionSnapshot): BookMatter {
  return bookMatterSchema.partial().parse(snapshot.matter);
}
