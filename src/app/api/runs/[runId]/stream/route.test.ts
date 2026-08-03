import { describe, expect, it, vi } from "vitest";

import {
  asNdjsonReadable,
  readableNamespace,
  readableStartIndex,
} from "@/app/api/runs/[runId]/stream/route";

describe("asNdjsonReadable", () => {
  it("encodes records and cancels the Workflow source when the request aborts", async () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    const request = new AbortController();
    const source = new ReadableStream<{ type: string }>({
      start(controller) {
        controller.enqueue({ type: "stage" });
      },
      cancel,
    });
    const reader = asNdjsonReadable(source, request.signal, onClose).getReader();

    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('{"type":"stage"}\n');

    request.abort("navigation");
    await expect(reader.read()).resolves.toMatchObject({ done: true });
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith("navigation");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("propagates downstream cancellation to the Workflow source", async () => {
    const cancel = vi.fn();
    const source = new ReadableStream({
      pull() {
        // Remain open until the response consumer disconnects.
      },
      cancel,
    });
    const reader = asNdjsonReadable(source, new AbortController().signal).getReader();
    const pendingRead = reader.read();

    await reader.cancel("response closed");

    await expect(pendingRead).resolves.toMatchObject({ done: true });
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith("response closed");
  });

  it("does not attach a Workflow reader after an already-aborted request", async () => {
    const cancel = vi.fn();
    const request = new AbortController();
    request.abort("request already closed");
    const source = new ReadableStream({ cancel });
    const reader = asNdjsonReadable(source, request.signal).getReader();

    await expect(reader.read()).resolves.toMatchObject({ done: true });
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith("request already closed");
  });

  it("cancels and cleans up the source when NDJSON encoding fails", async () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    const source = new ReadableStream<bigint>({
      start(controller) {
        controller.enqueue(BigInt(1));
      },
      cancel,
    });
    const reader = asNdjsonReadable(source, new AbortController().signal, onClose).getReader();

    await expect(reader.read()).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("authoring stream request validation", () => {
  it("accepts only progress and positive chapter namespaces", () => {
    expect(readableNamespace(null)).toEqual({ value: "progress", chapterNumber: null });
    expect(readableNamespace("progress")).toEqual({ value: "progress", chapterNumber: null });
    expect(readableNamespace("chapter:12")).toEqual({ value: "chapter:12", chapterNumber: 12 });
    expect(readableNamespace("chapter:0")).toBeNull();
    expect(readableNamespace("chapter:0001")).toBeNull();
    expect(readableNamespace("chapter:-1")).toBeNull();
    expect(readableNamespace("internal")).toBeNull();
  });

  it("requires a nonnegative safe-integer replay position", () => {
    expect(readableStartIndex(null)).toBe(0);
    expect(readableStartIndex("12")).toBe(12);
    expect(readableStartIndex("-1")).toBeNull();
    expect(readableStartIndex("1.5")).toBeNull();
    expect(readableStartIndex("Infinity")).toBeNull();
    expect(readableStartIndex(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });
});
