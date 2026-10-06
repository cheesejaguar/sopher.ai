import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GeneratedEntityBible } from "@/ai/agents/entity-bible";
import type { BookConcept, BookOutline } from "@/ai/schemas";
import type { GenerationConfig } from "@/lib/run-events";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  withDbTransaction: vi.fn(),
  generateEntityBible: vi.fn(),
  persistEntityBible: vi.fn(),
  listEntities: vi.fn(),
  getOrCreateBook: vi.fn(),
  configWrites: [] as unknown[],
}));

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: mocks.getDb,
  withDbTransaction: mocks.withDbTransaction,
}));

vi.mock("@/ai/agents/entity-bible", () => ({
  generateEntityBible: mocks.generateEntityBible,
  persistEntityBible: mocks.persistEntityBible,
}));

vi.mock("@/db/queries/entities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/queries/entities")>()),
  listEntities: mocks.listEntities,
}));

vi.mock("@/db/queries/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/queries/projects")>()),
  getOrCreateBook: mocks.getOrCreateBook,
}));

import { entityBibleStep } from "./steps";

const ref = {
  dbRunId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  userId: "user-1",
};

const config = {
  tier: "standard",
  requireOutlineApproval: false,
  waveSize: 4,
  targetChapters: 3,
  targetWordsPerChapter: 2_000,
  inputSnapshot: { brief: "A cartographer follows a disappearing road.", avoidTopics: [] },
} as unknown as GenerationConfig;

const bible: GeneratedEntityBible = {
  entities: [{ kind: "character", name: "Mira Venn", aliases: [], attrs: {} }],
  relationships: [],
} as unknown as GeneratedEntityBible;

/** A drizzle-shaped chain: every builder method returns it, awaiting yields `rows`. */
function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit", "orderBy", "returning"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.set = vi.fn((values: { config?: unknown }) => {
    if (values.config) mocks.configWrites.push(values.config);
    return builder;
  });
  builder.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return builder;
}

function mockDatabase(stored: GenerationConfig) {
  let current = stored;
  // loadRunContext selects the whole project row; every other read here is
  // the run's config/status.
  const select = vi.fn((selection?: Record<string, unknown>) =>
    selection === undefined
      ? chain([{ id: ref.projectId, title: "The River Door" }])
      : chain([{ config: current, status: "running", cancellationRequestedAt: null }]),
  );
  const update = vi.fn(() => {
    const builder = chain([]);
    builder.set = vi.fn((values: { config: GenerationConfig }) => {
      current = values.config;
      mocks.configWrites.push(values.config);
      return chain([{ config: values.config }]);
    });
    return builder;
  });
  const db = { select, update, execute: vi.fn(async () => []) };
  mocks.getDb.mockReturnValue(db);
  mocks.withDbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(db),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configWrites.length = 0;
  mocks.getOrCreateBook.mockResolvedValue({ id: "book-1" });
  mocks.listEntities.mockResolvedValue([]);
  mocks.persistEntityBible.mockResolvedValue({ entityCount: 1, relationshipCount: 0 });
});

describe("entityBibleStep output checkpoint", () => {
  it("checkpoints the paid bible before persisting it, then clears it with the proof", async () => {
    mockDatabase(config);
    mocks.generateEntityBible.mockResolvedValue(bible);

    await expect(
      entityBibleStep(ref, config, {} as BookConcept, {} as BookOutline),
    ).resolves.toEqual({ entityCount: 1, relationshipCount: 0 });

    const [checkpointed, completed] = mocks.configWrites as GenerationConfig[];
    expect(checkpointed.work?.entityBible).toEqual(bible);
    expect(completed.work?.entityBible).toBeUndefined();
    expect(completed.completion?.entityBible).toMatchObject({ entityCount: 1 });
  });

  it("persists a checkpointed bible on retry instead of buying it again", async () => {
    mockDatabase({ ...config, work: { entityBible: bible } });

    await entityBibleStep(ref, config, {} as BookConcept, {} as BookOutline);

    expect(mocks.generateEntityBible).not.toHaveBeenCalled();
    expect(mocks.persistEntityBible).toHaveBeenCalledWith("book-1", bible, expect.anything());
  });
});
