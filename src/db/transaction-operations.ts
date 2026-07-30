import { and, eq, inArray, sql } from "drizzle-orm";

import { schema, type DbTransaction } from "@/db";

export type DisplacedAsset = { id: string; pathname: string };

export async function lockProjectAuthoring(tx: DbTransaction, projectId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${projectId}, 0)
    )`,
  );
}

export async function persistDiagramAssetsTransaction(
  tx: DbTransaction,
  input: {
    projectId: string;
    chapterId: string;
    sourceHash: string;
    alt: string;
    svg: {
      url: string;
      pathname: string;
      sizeBytes: number;
    };
    png: {
      url: string;
      pathname: string;
      sizeBytes: number;
    };
  },
): Promise<void> {
  await lockProjectAuthoring(tx, input.projectId);
  const meta = { sourceHash: input.sourceHash, alt: input.alt };
  await tx.insert(schema.assets).values([
    {
      projectId: input.projectId,
      chapterId: input.chapterId,
      kind: "diagram",
      blobUrl: input.svg.url,
      blobPathname: input.svg.pathname,
      contentType: "image/svg+xml",
      sizeBytes: input.svg.sizeBytes,
      meta,
    },
    {
      projectId: input.projectId,
      chapterId: input.chapterId,
      kind: "diagram",
      blobUrl: input.png.url,
      blobPathname: input.png.pathname,
      contentType: "image/png",
      sizeBytes: input.png.sizeBytes,
      meta,
    },
  ]);
}

export async function replacePortraitAssetTransaction(
  tx: DbTransaction,
  input: {
    projectId: string;
    entityId: string;
    url: string;
    pathname: string;
    contentType: string;
    sizeBytes: number;
    meta: Record<string, unknown>;
    onDisplacedCandidate?: (asset: DisplacedAsset | undefined) => void;
  },
): Promise<DisplacedAsset | undefined> {
  await lockProjectAuthoring(tx, input.projectId);
  const [lockedEntity] = await tx
    .select({ portraitAssetId: schema.entities.portraitAssetId })
    .from(schema.entities)
    .where(eq(schema.entities.id, input.entityId))
    .limit(1);
  if (!lockedEntity) throw new Error("Entity disappeared while storing its portrait");

  const [displaced] = lockedEntity.portraitAssetId
    ? await tx
        .select({
          id: schema.assets.id,
          pathname: schema.assets.blobPathname,
        })
        .from(schema.assets)
        .where(eq(schema.assets.id, lockedEntity.portraitAssetId))
        .limit(1)
    : [];
  input.onDisplacedCandidate?.(displaced);

  const [asset] = await tx
    .insert(schema.assets)
    .values({
      projectId: input.projectId,
      kind: "portrait",
      blobUrl: input.url,
      blobPathname: input.pathname,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      meta: input.meta,
    })
    .returning({ id: schema.assets.id });
  if (!asset) throw new Error("Could not record portrait asset");

  const [updated] = await tx
    .update(schema.entities)
    .set({ portraitAssetId: asset.id, updatedAt: new Date() })
    .where(eq(schema.entities.id, input.entityId))
    .returning({ id: schema.entities.id });
  if (!updated) throw new Error("Entity disappeared while storing its portrait");
  return displaced;
}

export async function replaceCoverAssetTransaction(
  tx: DbTransaction,
  input: {
    projectId: string;
    bookId: string;
    title: string;
    operationKey: string;
    url: string;
    pathname: string;
    contentType: string;
    sizeBytes: number;
    onDisplacedCandidate?: (asset: DisplacedAsset | undefined) => void;
  },
): Promise<DisplacedAsset | undefined> {
  await lockProjectAuthoring(tx, input.projectId);
  const [lockedBook] = await tx
    .select({ frontMatter: schema.books.frontMatter })
    .from(schema.books)
    .where(and(eq(schema.books.id, input.bookId), eq(schema.books.projectId, input.projectId)))
    .limit(1);
  if (!lockedBook) throw new Error("Book disappeared while storing its cover");

  const currentCoverUrl = (lockedBook.frontMatter as Record<string, unknown>).coverUrl;
  const [displaced] =
    typeof currentCoverUrl === "string"
      ? await tx
          .select({
            id: schema.assets.id,
            pathname: schema.assets.blobPathname,
          })
          .from(schema.assets)
          .where(
            and(
              eq(schema.assets.projectId, input.projectId),
              eq(schema.assets.kind, "cover"),
              eq(schema.assets.blobUrl, currentCoverUrl),
            ),
          )
          .limit(1)
      : [];
  input.onDisplacedCandidate?.(displaced);

  await tx.insert(schema.assets).values({
    projectId: input.projectId,
    kind: "cover",
    blobUrl: input.url,
    blobPathname: input.pathname,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    meta: { title: input.title, operationKey: input.operationKey },
  });

  const [updated] = await tx
    .update(schema.books)
    .set({
      frontMatter: {
        ...(lockedBook.frontMatter as Record<string, unknown>),
        coverUrl: input.url,
      },
      updatedAt: new Date(),
    })
    .where(and(eq(schema.books.id, input.bookId), eq(schema.books.projectId, input.projectId)))
    .returning({ id: schema.books.id });
  if (!updated) throw new Error("Book disappeared while storing its cover");
  return displaced;
}

export async function persistContentToolDeliveryTransaction<TOutput>(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    chapterId: string;
    toolId: string;
    operationKey: string;
    text: string;
    options: Record<string, unknown>;
    output: TOutput;
    usd: string;
    asset?: {
      url: string;
      pathname: string;
      contentType: string;
      sizeBytes: number;
      prompt: string;
    };
  },
): Promise<{ output: TOutput; replayed: boolean }> {
  await lockProjectAuthoring(tx, input.projectId);

  const [alreadyDelivered] = await tx
    .select({ output: schema.contentToolRuns.output })
    .from(schema.contentToolRuns)
    .where(
      and(
        eq(schema.contentToolRuns.userId, input.userId),
        eq(schema.contentToolRuns.projectId, input.projectId),
        eq(schema.contentToolRuns.chapterId, input.chapterId),
        eq(schema.contentToolRuns.toolId, input.toolId),
        sql`${schema.contentToolRuns.input}->>'operationKey' = ${input.operationKey}`,
      ),
    )
    .limit(1);
  if (alreadyDelivered) {
    return { output: alreadyDelivered.output as TOutput, replayed: true };
  }

  if (input.asset) {
    await tx.insert(schema.assets).values({
      projectId: input.projectId,
      chapterId: input.chapterId,
      kind: "illustration",
      blobUrl: input.asset.url,
      blobPathname: input.asset.pathname,
      contentType: input.asset.contentType,
      sizeBytes: input.asset.sizeBytes,
      meta: {
        prompt: input.asset.prompt,
        operationKey: input.operationKey,
      },
    });
  }
  await tx.insert(schema.contentToolRuns).values({
    userId: input.userId,
    projectId: input.projectId,
    chapterId: input.chapterId,
    toolId: input.toolId,
    input: { text: input.text, options: input.options, operationKey: input.operationKey },
    output: input.output,
    usd: input.usd,
  });
  return { output: input.output, replayed: false };
}

export async function persistExportAssetTransaction(
  tx: DbTransaction,
  input: {
    projectId: string;
    runId: string;
    kind: "export_epub" | "export_pdf" | "export_docx" | "export_md";
    url: string;
    pathname: string;
    contentType: string;
    sizeBytes: number;
    format: string;
    filename: string;
  },
): Promise<{ id: string; meta: unknown } | undefined> {
  await lockProjectAuthoring(tx, input.projectId);
  const [alreadyStored] = await tx
    .select({ id: schema.assets.id, meta: schema.assets.meta })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.projectId, input.projectId),
        eq(schema.assets.kind, input.kind),
        sql`${schema.assets.meta}->>'runId' = ${input.runId}`,
      ),
    )
    .limit(1);
  if (alreadyStored) return alreadyStored;
  const [stored] = await tx
    .insert(schema.assets)
    .values({
      projectId: input.projectId,
      kind: input.kind,
      blobUrl: input.url,
      blobPathname: input.pathname,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      meta: { runId: input.runId, format: input.format, filename: input.filename },
    })
    .returning({ id: schema.assets.id, meta: schema.assets.meta });
  return stored;
}

export async function projectExistsUnderAuthoringLock(
  tx: DbTransaction,
  projectId: string,
): Promise<boolean> {
  await lockProjectAuthoring(tx, projectId);
  const [project] = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  return Boolean(project);
}

export async function referencedAssetPathnamesUnderAuthoringLock(
  tx: DbTransaction,
  projectId: string,
  pathnames: string[],
): Promise<string[]> {
  await lockProjectAuthoring(tx, projectId);
  if (pathnames.length === 0) return [];
  const referenced = await tx
    .select({ pathname: schema.assets.blobPathname })
    .from(schema.assets)
    // Blob pathnames are global. A defensive reference in another project is
    // still enough to prevent deletion, even though this project's advisory
    // lock is the one that serializes its own persistence/deletion race.
    .where(inArray(schema.assets.blobPathname, pathnames));
  return referenced.map((row) => row.pathname);
}
