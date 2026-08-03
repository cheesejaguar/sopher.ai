// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExportHistoryItem } from "@/lib/export/history";

import { ExportDialog } from "./export-dialog";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function record(overrides: Partial<ExportHistoryItem> = {}): ExportHistoryItem {
  return {
    runId: "22222222-2222-4222-8222-222222222222",
    format: "pdf",
    status: "completed",
    error: null,
    asset: {
      id: "33333333-3333-4333-8333-333333333333",
      filename: "the-clockmakers-map.pdf",
    },
    createdAt: "2026-08-01T19:00:00.000Z",
    completedAt: "2026-08-01T19:00:04.000Z",
    acceptanceUncertain: false,
    dispatchAttempts: 1,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ExportDialog", () => {
  it("reattaches to an active export after reload instead of starting a duplicate", async () => {
    const active = record({
      status: "running",
      asset: null,
      completedAt: null,
    });
    const completed = record();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("?runId=")) {
        return new Response(JSON.stringify(completed), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      expect(init?.method).toBeUndefined();
      return new Response(JSON.stringify({ exports: [active] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExportDialog projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByText("Latest export restored")).toBeVisible();
    expect(screen.getByText("the-clockmakers-map.pdf")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /download the proof pdf export, the-clockmakers-map\.pdf/i,
      }),
    ).toHaveAttribute("href", "/api/exports/33333333-3333-4333-8333-333333333333");
    expect(fetchMock).not.toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/export`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("restores the latest completed export and keeps older downloads in history", async () => {
    const latest = record();
    const older = record({
      runId: "44444444-4444-4444-8444-444444444444",
      format: "docx",
      asset: {
        id: "55555555-5555-4555-8555-555555555555",
        filename: "the-clockmakers-map.docx",
        incomplete: true,
      },
      incomplete: true,
      createdAt: "2026-07-31T18:00:00.000Z",
      completedAt: "2026-07-31T18:00:05.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ exports: [latest, older] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<ExportDialog projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByText("Latest export restored")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recent exports" })).toBeVisible();
    expect(screen.getByText("Word · Ready")).toBeVisible();
    expect(screen.getByText(/incomplete snapshot/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /download word export, the-clockmakers-map\.docx/i }),
    ).toHaveAttribute("href", "/api/exports/55555555-5555-4555-8555-555555555555");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
