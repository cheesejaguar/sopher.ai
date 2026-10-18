import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  transaction: vi.fn(),
  requireUser: vi.fn(),
  reconcile: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getSqlClient: mocks.getSqlClient };
});
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/generation-runs", () => ({
  reconcileBeforeAuthoringRunConflict: mocks.reconcile,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createBibleEntity, updateBibleEntity } from "./entities";

const entityId = "66666666-6666-4666-8666-666666666661";
const characterInput = {
  kind: "character",
  name: "Mara Vale",
  aliases: ["Mara", "mara", "Mara Vale"],
  appearance: "Short and sure-footed",
  background: "Raised in the canal district",
  goals: ["Restore the river quarter"],
  personality: ["Observant"],
  voice: "Spare, exact sentences",
  arc: "Claims authorship of her work",
  facts: ["The compass responds to her touch"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.reconcile.mockResolvedValue(undefined);
  mocks.getSqlClient.mockReturnValue({ transaction: mocks.transaction });
});

describe("Story Bible entity actions", () => {
  it("rejects malformed input before opening a database transaction", async () => {
    const result = await updateBibleEntity("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d", "not-an-id", {
      ...characterInput,
      name: "",
    });

    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("updates under the project authoring lock with ownership and active-run guards", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      expect(queries).toHaveLength(2);
      expect(queries[0].strings.join("?")).toContain("pg_advisory_xact_lock");
      expect(queries[0].strings.join("?")).toContain("sopher:project-authoring:");

      const mutation = queries[1].strings.join("?");
      expect(mutation).toContain("join projects p");
      expect(mutation).toContain("p.user_id");
      expect(mutation).toContain("gr.status in ('queued', 'running', 'awaiting_input')");
      expect(mutation).toContain("gr.kind <> 'export'");
      expect(mutation).toContain("lower(other.name) = lower(");
      expect(mutation).toContain("e.attrs - array[");
      expect(mutation).toContain(") ||");

      const values = queries[1].values as unknown[];
      expect(values).toContain(JSON.stringify(["Mara"]));
      const jsonObjects = values
        .filter((value): value is string => typeof value === "string" && value.startsWith("{"))
        .map((value) => JSON.parse(value) as Record<string, unknown>);
      expect(jsonObjects).toContainEqual(
        expect.objectContaining({
          appearance: "Short and sure-footed",
          speech: "Spare, exact sentences",
        }),
      );
      return [[], [{ status: "saved", entity_id: entityId }]];
    });

    const result = await updateBibleEntity(
      "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
      entityId,
      characterInput,
    );

    expect(result).toEqual({ ok: true, entityId });
    expect(mocks.reconcile).toHaveBeenCalledWith({
      projectId: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
      userId: "user-1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/projects/71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d/bible",
    );
  });

  it("returns a truthful read-only result while authoring is active", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      build(tx);
      return [[], [{ status: "active_run", entity_id: null }]];
    });

    await expect(
      updateBibleEntity("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d", entityId, characterInput),
    ).resolves.toMatchObject({
      ok: false,
      error: "active_run",
      message: expect.stringContaining("Finish or stop"),
    });
  });

  it("creates only a character, place, or object and detects names case-insensitively", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      const mutation = queries[1].strings.join("?");
      expect(mutation).toContain("insert into entities");
      expect(mutation).toContain("lower(e.name) = lower(");
      return [[], [{ status: "created", entity_id: entityId }]];
    });

    const result = await createBibleEntity("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d", {
      ...characterInput,
      kind: "location",
      name: "Bellweather Observatory",
    });
    expect(result).toEqual({ ok: true, entityId });

    await expect(
      createBibleEntity("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d", {
        ...characterInput,
        kind: "organization",
      }),
    ).resolves.toMatchObject({ ok: false, error: "invalid" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("Story Bible project id validation", () => {
  it("returns not found for a malformed project id without reconciling", async () => {
    await expect(createBibleEntity("not-a-uuid", characterInput)).resolves.toMatchObject({
      ok: false,
      error: "not_found",
    });
    await expect(
      updateBibleEntity("not-a-uuid", "11111111-1111-4111-8111-111111111111", characterInput),
    ).resolves.toMatchObject({ ok: false, error: "not_found" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
