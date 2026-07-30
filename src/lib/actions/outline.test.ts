import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  transaction: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getSqlClient: mocks.getSqlClient };
});
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { saveOutline } from "./outline";

const outline = {
  title: "The River Door",
  logline: "A mapmaker follows a road that vanishes each dawn.",
  synopsis: "A journey beyond the last reliable map.",
  themes: ["memory"],
  plotStructure: "three_act",
  chapters: Array.from({ length: 3 }, (_, index) => ({
    number: index + 1,
    title: `Chapter ${index + 1}`,
    summary: `The journey advances in chapter ${index + 1}.`,
    keyEvents: [],
    charactersPresent: [],
    emotionalArc: "rising_action" as const,
    openingHook: "A new trail appears.",
    closingHook: "The trail vanishes.",
    targetWords: 2_000,
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.getSqlClient.mockReturnValue({ transaction: mocks.transaction });
});

describe("saveOutline", () => {
  it("blocks edits while a generation run is awaiting author input", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      build(tx);
      return [[], [{ status: "active_run" }]];
    });

    await expect(saveOutline("project-1", outline)).rejects.toThrow(
      "Finish or stop the current run before editing the outline",
    );
  });

  it("allocates the version and inserts under the same project lock used by run start", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      expect(queries).toHaveLength(2);
      expect(queries[0].strings.join("?")).toContain("pg_advisory_xact_lock");
      expect(queries[0].strings.join("?")).toContain("sopher:project-authoring:");
      const mutation = queries[1].strings.join("?");
      expect(mutation).toContain("active_run as materialized");
      expect(mutation).toContain("gr.status in ('queued', 'running', 'awaiting_input')");
      expect(mutation).toContain("max(o.version)");
      expect(mutation).toContain("insert into outlines");
      return [[], [{ status: "saved" }]];
    });

    await expect(saveOutline("project-1", outline)).resolves.toBeUndefined();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/projects/project-1/outline");
  });
});
