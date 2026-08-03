// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReaderShareSummary } from "@/lib/publication-editions";
import { ShareReaderDialog } from "./share-reader-dialog";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function share(overrides: Partial<ReaderShareSummary> = {}): ReaderShareSummary {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    status: "active",
    label: "Beta readers",
    allowDownload: false,
    incomplete: false,
    chapterCount: 8,
    totalWords: 24_000,
    createdAt: "2026-08-02T12:00:00.000Z",
    expiresAt: "2026-09-01T12:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ShareReaderDialog", () => {
  it("requests a server-generated secret URL with a retry-stable request key", async () => {
    const created = share();
    const token = "uXFb2jtK_sno-TzLiofyD7TqBYZ3p3YP5eI6jgoyjZs";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          requestKey: string;
          label: string;
          expires: string;
          allowDownload: boolean;
          acceptedReaderTerms: boolean;
        };
        expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
        expect(body).toMatchObject({
          label: "Early circle",
          expires: "30d",
          allowDownload: true,
          acceptedReaderTerms: true,
        });
        return new Response(
          JSON.stringify({ share: created, url: `/r/${created.id}#token=${token}` }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ shares: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ShareReaderDialog projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Share reader" }));
    fireEvent.change(await screen.findByLabelText("Link label"), {
      target: { value: "Early circle" },
    });
    fireEvent.click(screen.getByLabelText("Show a Markdown download button"));
    fireEvent.click(screen.getByRole("checkbox", { name: /i understand that anyone/i }));
    fireEvent.click(screen.getByRole("button", { name: "Create secret reader link" }));

    const input = await screen.findByLabelText("New reader link");
    expect((input as HTMLInputElement).value).toBe(
      `http://localhost:3000/r/${created.id}#token=${token}`,
    );
    expect(screen.getByText("Copy this link now")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith((input as HTMLInputElement).value));
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("loads and revokes an active link without needing the secret token", async () => {
    const current = share();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        expect(JSON.parse(String(init.body))).toEqual({ shareId: current.id });
        return new Response(JSON.stringify({ revoked: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ shares: [current] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ShareReaderDialog projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Share reader" }));
    expect(await screen.findByText("Beta readers")).toBeVisible();
    expect(screen.getByText(/8 chapters · 24,000 words/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("No active reader links.")).toBeVisible();
  });
});
