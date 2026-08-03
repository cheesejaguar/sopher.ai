import { and, eq, inArray, sql } from "drizzle-orm";

import { schema, type DbTransaction } from "@/db";

export type DisplacedAsset = { id: string; pathname: string };

export type OptionalDeliveryReplay<TOutput> = {
  output: TOutput;
  replayed: boolean;
};

export const COVER_DELIVERY_TOOL_ID = "cover.generate";
export const PORTRAIT_DELIVERY_TOOL_ID = "entity.portrait";

export async function lockProjectAuthoring(tx: DbTransaction, projectId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${projectId}, 0)
    )`,
  );
}

async function recordOptionalDeliveryReceiptTransaction(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    deliveryReceiptRef: string;
    description: string;
  },
): Promise<"created" | "existing"> {
  const [created] = await tx
    .insert(schema.creditLedger)
    .values({
      userId: input.userId,
      amount: "0",
      kind: "adjustment",
      description: input.description,
      projectId: input.projectId,
      runId: null,
      externalRef: input.deliveryReceiptRef,
    })
    .onConflictDoNothing()
    .returning({ id: schema.creditLedger.id });
  if (created) return "created";

  const [existing] = await tx
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, input.userId),
        eq(schema.creditLedger.projectId, input.projectId),
        sql`${schema.creditLedger.runId} is null`,
        eq(schema.creditLedger.kind, "adjustment"),
        eq(schema.creditLedger.amount, "0"),
        eq(schema.creditLedger.externalRef, input.deliveryReceiptRef),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("Optional delivery receipt identity conflicts with another ledger entry");
  }
  return "existing";
}

async function releaseOptionalDeliveryLeasesTransaction(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    leaseRefs?: string[];
  },
): Promise<void> {
  const leaseRefs = [
    ...new Set(
      (input.leaseRefs ?? []).filter((ref) => ref.startsWith("optional-operation-lease:")),
    ),
  ];
  if (leaseRefs.length === 0) return;
  await tx
    .insert(schema.creditLedger)
    .values(
      leaseRefs.map((ref) => ({
        userId: input.userId,
        amount: "0",
        kind: "adjustment" as const,
        description: "Release optional operation after durable delivery",
        projectId: input.projectId,
        runId: null,
        externalRef: `release:${ref}`,
      })),
    )
    .onConflictDoNothing();
}

async function findOptionalDeliveryOutput<TOutput>(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    chapterId?: string | null;
    toolId: string;
    deliveryReceiptRef: string;
  },
): Promise<TOutput | undefined> {
  const [row] = await tx
    .select({ output: schema.contentToolRuns.output })
    .from(schema.contentToolRuns)
    .where(
      and(
        eq(schema.contentToolRuns.userId, input.userId),
        eq(schema.contentToolRuns.projectId, input.projectId),
        input.chapterId
          ? eq(schema.contentToolRuns.chapterId, input.chapterId)
          : sql`${schema.contentToolRuns.chapterId} is null`,
        eq(schema.contentToolRuns.toolId, input.toolId),
        sql`${schema.contentToolRuns.input}->>'deliveryReceiptRef' = ${input.deliveryReceiptRef}`,
      ),
    )
    .limit(1);
  return row?.output as TOutput | undefined;
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

type ImageDeliveryOutput = { url: string };

export async function persistPortraitDeliveryTransaction(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    entityId: string;
    operationKey: string;
    deliveryReceiptRef: string;
    url: string;
    pathname: string;
    contentType: string;
    sizeBytes: number;
    prompt: string;
    usd: string;
    optionalLeaseRefs?: string[];
    onDisplacedCandidate?: (asset: DisplacedAsset | undefined) => void;
  },
): Promise<OptionalDeliveryReplay<ImageDeliveryOutput> & { displaced?: DisplacedAsset }> {
  await lockProjectAuthoring(tx, input.projectId);
  const existing = await findOptionalDeliveryOutput<ImageDeliveryOutput>(tx, {
    userId: input.userId,
    projectId: input.projectId,
    chapterId: null,
    toolId: PORTRAIT_DELIVERY_TOOL_ID,
    deliveryReceiptRef: input.deliveryReceiptRef,
  });
  if (existing) {
    await recordOptionalDeliveryReceiptTransaction(tx, {
      userId: input.userId,
      projectId: input.projectId,
      deliveryReceiptRef: input.deliveryReceiptRef,
      description: "Durable portrait delivery receipt",
    });
    await releaseOptionalDeliveryLeasesTransaction(tx, {
      userId: input.userId,
      projectId: input.projectId,
      leaseRefs: input.optionalLeaseRefs,
    });
    return { output: existing, replayed: true };
  }

  const receipt = await recordOptionalDeliveryReceiptTransaction(tx, {
    userId: input.userId,
    projectId: input.projectId,
    deliveryReceiptRef: input.deliveryReceiptRef,
    description: "Durable portrait delivery receipt",
  });
  if (receipt === "existing") {
    throw new Error("Portrait delivery receipt exists without its immutable output");
  }

  const displaced = await replacePortraitAssetTransaction(tx, {
    projectId: input.projectId,
    entityId: input.entityId,
    url: input.url,
    pathname: input.pathname,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    meta: {
      entityId: input.entityId,
      prompt: input.prompt,
      operationKey: input.operationKey,
      deliveryReceiptRef: input.deliveryReceiptRef,
    },
    onDisplacedCandidate: input.onDisplacedCandidate,
  });
  await tx.insert(schema.contentToolRuns).values({
    userId: input.userId,
    projectId: input.projectId,
    chapterId: null,
    toolId: PORTRAIT_DELIVERY_TOOL_ID,
    input: {
      entityId: input.entityId,
      operationKey: input.operationKey,
      deliveryReceiptRef: input.deliveryReceiptRef,
    },
    output: { url: input.url } satisfies ImageDeliveryOutput,
    usd: input.usd,
  });
  await releaseOptionalDeliveryLeasesTransaction(tx, {
    userId: input.userId,
    projectId: input.projectId,
    leaseRefs: input.optionalLeaseRefs,
  });
  return { output: { url: input.url }, replayed: false, ...(displaced ? { displaced } : {}) };
}

export async function persistCoverDeliveryTransaction(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    bookId: string;
    title: string;
    operationKey: string;
    deliveryReceiptRef: string;
    url: string;
    pathname: string;
    contentType: string;
    sizeBytes: number;
    usd: string;
    optionalLeaseRefs?: string[];
    onDisplacedCandidate?: (asset: DisplacedAsset | undefined) => void;
  },
): Promise<OptionalDeliveryReplay<ImageDeliveryOutput> & { displaced?: DisplacedAsset }> {
  await lockProjectAuthoring(tx, input.projectId);
  const existing = await findOptionalDeliveryOutput<ImageDeliveryOutput>(tx, {
    userId: input.userId,
    projectId: input.projectId,
    chapterId: null,
    toolId: COVER_DELIVERY_TOOL_ID,
    deliveryReceiptRef: input.deliveryReceiptRef,
  });
  if (existing) {
    await recordOptionalDeliveryReceiptTransaction(tx, {
      userId: input.userId,
      projectId: input.projectId,
      deliveryReceiptRef: input.deliveryReceiptRef,
      description: "Durable cover delivery receipt",
    });
    await releaseOptionalDeliveryLeasesTransaction(tx, {
      userId: input.userId,
      projectId: input.projectId,
      leaseRefs: input.optionalLeaseRefs,
    });
    return { output: existing, replayed: true };
  }

  const receipt = await recordOptionalDeliveryReceiptTransaction(tx, {
    userId: input.userId,
    projectId: input.projectId,
    deliveryReceiptRef: input.deliveryReceiptRef,
    description: "Durable cover delivery receipt",
  });
  if (receipt === "existing") {
    throw new Error("Cover delivery receipt exists without its immutable output");
  }

  const displaced = await replaceCoverAssetTransaction(tx, {
    projectId: input.projectId,
    bookId: input.bookId,
    title: input.title,
    operationKey: input.operationKey,
    url: input.url,
    pathname: input.pathname,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    onDisplacedCandidate: input.onDisplacedCandidate,
  });
  await tx.insert(schema.contentToolRuns).values({
    userId: input.userId,
    projectId: input.projectId,
    chapterId: null,
    toolId: COVER_DELIVERY_TOOL_ID,
    input: {
      bookId: input.bookId,
      operationKey: input.operationKey,
      deliveryReceiptRef: input.deliveryReceiptRef,
    },
    output: { url: input.url } satisfies ImageDeliveryOutput,
    usd: input.usd,
  });
  await releaseOptionalDeliveryLeasesTransaction(tx, {
    userId: input.userId,
    projectId: input.projectId,
    leaseRefs: input.optionalLeaseRefs,
  });
  return { output: { url: input.url }, replayed: false, ...(displaced ? { displaced } : {}) };
}

/**
 * Converts an exact legacy asset replay into immutable delivery evidence.
 * The asset is rechecked under the project lock; absence or a mismatched key is
 * not sufficient evidence and therefore never creates a receipt.
 */
export async function promoteLegacyImageDeliveryTransaction(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    assetId: string;
    kind: "cover" | "portrait";
    targetId: string;
    operationKey: string;
    deliveryReceiptRef: string;
  },
): Promise<ImageDeliveryOutput | null> {
  await lockProjectAuthoring(tx, input.projectId);
  const toolId = input.kind === "cover" ? COVER_DELIVERY_TOOL_ID : PORTRAIT_DELIVERY_TOOL_ID;
  const existing = await findOptionalDeliveryOutput<ImageDeliveryOutput>(tx, {
    userId: input.userId,
    projectId: input.projectId,
    chapterId: null,
    toolId,
    deliveryReceiptRef: input.deliveryReceiptRef,
  });
  if (existing) return existing;

  const [asset] = await tx
    .select({ url: schema.assets.blobUrl })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.id, input.assetId),
        eq(schema.assets.projectId, input.projectId),
        eq(schema.assets.kind, input.kind),
        sql`${schema.assets.meta}->>'operationKey' = ${input.operationKey}`,
        input.kind === "portrait"
          ? sql`${schema.assets.meta}->>'entityId' = ${input.targetId}`
          : sql`true`,
      ),
    )
    .limit(1);
  if (!asset) return null;

  const receipt = await recordOptionalDeliveryReceiptTransaction(tx, {
    userId: input.userId,
    projectId: input.projectId,
    deliveryReceiptRef: input.deliveryReceiptRef,
    description:
      input.kind === "cover"
        ? "Durable legacy cover delivery receipt"
        : "Durable legacy portrait delivery receipt",
  });
  if (receipt === "existing") {
    throw new Error("Legacy image receipt exists without its immutable output");
  }
  await tx.insert(schema.contentToolRuns).values({
    userId: input.userId,
    projectId: input.projectId,
    chapterId: null,
    toolId,
    input: {
      operationKey: input.operationKey,
      deliveryReceiptRef: input.deliveryReceiptRef,
      ...(input.kind === "cover" ? { bookId: input.targetId } : { entityId: input.targetId }),
      promotedFromAssetId: input.assetId,
    },
    output: { url: asset.url } satisfies ImageDeliveryOutput,
    usd: "0",
  });
  return { url: asset.url };
}

export async function promoteContentToolDeliveryReceiptTransaction<TOutput>(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    chapterId?: string | null;
    toolId: string;
    operationKey: string;
    deliveryReceiptRef: string;
  },
): Promise<TOutput | null> {
  await lockProjectAuthoring(tx, input.projectId);
  const exactReceipt = await findOptionalDeliveryOutput<TOutput>(tx, {
    userId: input.userId,
    projectId: input.projectId,
    chapterId: input.chapterId ?? null,
    toolId: input.toolId,
    deliveryReceiptRef: input.deliveryReceiptRef,
  });
  if (exactReceipt) {
    await recordOptionalDeliveryReceiptTransaction(tx, {
      userId: input.userId,
      projectId: input.projectId,
      deliveryReceiptRef: input.deliveryReceiptRef,
      description: "Durable content-tool delivery receipt",
    });
    return exactReceipt;
  }

  const [legacy] = await tx
    .select({ output: schema.contentToolRuns.output })
    .from(schema.contentToolRuns)
    .where(
      and(
        eq(schema.contentToolRuns.userId, input.userId),
        eq(schema.contentToolRuns.projectId, input.projectId),
        input.chapterId
          ? eq(schema.contentToolRuns.chapterId, input.chapterId)
          : sql`${schema.contentToolRuns.chapterId} is null`,
        eq(schema.contentToolRuns.toolId, input.toolId),
        sql`${schema.contentToolRuns.input}->>'operationKey' = ${input.operationKey}`,
      ),
    )
    .limit(1);
  if (!legacy) return null;

  await recordOptionalDeliveryReceiptTransaction(tx, {
    userId: input.userId,
    projectId: input.projectId,
    deliveryReceiptRef: input.deliveryReceiptRef,
    description: "Durable legacy content-tool delivery receipt",
  });
  return legacy.output as TOutput;
}

export async function persistContentToolDeliveryTransaction<TOutput>(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    chapterId: string;
    toolId: string;
    operationKey: string;
    deliveryReceiptRef?: string;
    text: string;
    options: Record<string, unknown>;
    output: TOutput;
    usd: string;
    optionalLeaseRefs?: string[];
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
    if (input.deliveryReceiptRef) {
      await recordOptionalDeliveryReceiptTransaction(tx, {
        userId: input.userId,
        projectId: input.projectId,
        deliveryReceiptRef: input.deliveryReceiptRef,
        description: "Durable content-tool delivery receipt",
      });
      await releaseOptionalDeliveryLeasesTransaction(tx, {
        userId: input.userId,
        projectId: input.projectId,
        leaseRefs: input.optionalLeaseRefs,
      });
    }
    return { output: alreadyDelivered.output as TOutput, replayed: true };
  }

  if (input.deliveryReceiptRef) {
    const receipt = await recordOptionalDeliveryReceiptTransaction(tx, {
      userId: input.userId,
      projectId: input.projectId,
      deliveryReceiptRef: input.deliveryReceiptRef,
      description: "Durable content-tool delivery receipt",
    });
    if (receipt === "existing") {
      throw new Error("Content-tool delivery receipt exists without its immutable output");
    }
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
    input: {
      text: input.text,
      options: input.options,
      operationKey: input.operationKey,
      ...(input.deliveryReceiptRef ? { deliveryReceiptRef: input.deliveryReceiptRef } : {}),
    },
    output: input.output,
    usd: input.usd,
  });
  await releaseOptionalDeliveryLeasesTransaction(tx, {
    userId: input.userId,
    projectId: input.projectId,
    leaseRefs: input.optionalLeaseRefs,
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
    snapshot?: {
      capturedAt: string;
      incomplete: boolean;
      chapterVersions: Array<{ number: number; version: number }>;
    };
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
      meta: {
        runId: input.runId,
        format: input.format,
        filename: input.filename,
        ...(input.snapshot ?? {}),
      },
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
