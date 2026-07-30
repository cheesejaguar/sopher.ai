import { describe, expect, it, vi } from "vitest";

import {
  compensateBlobPersistenceFailure,
  deleteUploadedBlobs,
  resolveBlobUploads,
} from "./lifecycle";

describe("blob upload lifecycle", () => {
  it("removes every successful partial upload when a sibling upload fails", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);

    await expect(
      resolveBlobUploads(
        [
          Promise.resolve({ pathname: "diagrams/example.svg" }),
          Promise.reject(new Error("PNG upload failed")),
        ],
        "diagram",
        remove,
      ),
    ).rejects.toThrow("PNG upload failed");

    expect(remove).toHaveBeenCalledWith(["diagrams/example.svg"]);
  });

  it("returns successful uploads in input order without cleanup", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);

    await expect(
      resolveBlobUploads(
        [
          Promise.resolve({ pathname: "diagrams/example.svg" }),
          Promise.resolve({ pathname: "diagrams/example.png" }),
        ],
        "diagram",
        remove,
      ),
    ).resolves.toEqual([
      { pathname: "diagrams/example.svg" },
      { pathname: "diagrams/example.png" },
    ]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("deduplicates pathnames before deleting", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);

    await deleteUploadedBlobs(["same", "same", "other"], "test", remove);

    expect(remove).toHaveBeenCalledWith(["same", "other"]);
  });

  it("preserves both failures when persistence and compensation fail", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("Blob unavailable"));

    await expect(
      compensateBlobPersistenceFailure(
        new Error("Database unavailable"),
        ["exports/example.pdf"],
        "export",
        remove,
      ),
    ).rejects.toMatchObject({
      name: "AggregateError",
      message: "export persistence failed and its uploaded blob could not be removed",
    });
  });
});
