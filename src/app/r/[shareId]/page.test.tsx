import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  cookies: vi.fn(),
  loadReaderEdition: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/publication-editions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/publication-editions")>();
  return { ...original, loadReaderEdition: mocks.loadReaderEdition };
});

import { ReaderSessionBootstrap } from "@/components/reader/reader-session-bootstrap";

import ReaderPage from "./page";

const SHARE_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "a".repeat(43);
type ReaderEditionProps = { params: Promise<{ shareId: string }> };

beforeEach(() => {
  mocks.connection.mockReset().mockResolvedValue(undefined);
  mocks.cookies.mockReset().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: TOKEN }),
  });
  mocks.loadReaderEdition.mockReset().mockResolvedValue({
    shareId: SHARE_ID,
    allowDownload: false,
    snapshot: {
      schemaVersion: 1,
      capturedAt: "2026-08-03T00:00:00.000Z",
      incomplete: false,
      title: "Reader proof",
      author: "Ada Author",
      synopsis: null,
      genre: null,
      editionNote: "Reader edition",
      matter: {},
      coverUrl: null,
      assetUrls: [],
      chapters: [
        {
          number: 1,
          title: "The opening",
          markdown: "The story begins.",
          wordCount: 3,
        },
      ],
      figures: {},
    },
  });
});

describe("reader page session boundary", () => {
  it("renders the inert fragment scrubber when a valid scoped cookie already loads the edition", async () => {
    const page = ReaderPage({ params: Promise.resolve({ shareId: SHARE_ID }) });
    expect(isValidElement(page)).toBe(true);

    const readerNode = (page as ReactElement<{ children: ReactElement<ReaderEditionProps> }>).props
      .children;
    const renderReaderEdition = readerNode.type as (
      props: ReaderEditionProps,
    ) => Promise<ReactElement<{ children: ReactNode }>>;
    const edition = await renderReaderEdition(readerNode.props);
    const children = Children.toArray(edition.props.children);
    const scrubber = children[0];

    expect(isValidElement(scrubber)).toBe(true);
    expect((scrubber as ReactElement).type).toBe(ReaderSessionBootstrap);
    expect((scrubber as ReactElement<{ shareId: string; hasValidSession: boolean }>).props).toEqual(
      {
        shareId: SHARE_ID,
        hasValidSession: true,
      },
    );
    expect(mocks.loadReaderEdition).toHaveBeenCalledOnce();
    expect(mocks.loadReaderEdition).toHaveBeenCalledWith(TOKEN);
  });
});
