import { describe, expect, it } from "vitest";

import {
  BOOK_MATTER_DRAFT_FIELDS,
  BOOK_MATTER_DRAFT_TARGET,
  bookMatterPageCount,
  bookMatterSchema,
  closingBookMatter,
  openingBookMatter,
  publishingKitSchema,
  readBookMatter,
  readPublishingKit,
} from "./book-package";

describe("book package", () => {
  it("reads historical partial JSON without trusting unknown keys", () => {
    expect(
      readBookMatter({
        subtitle: "  A Chronicle  ",
        author: " A. Writer ",
        coverUrl: "not a URL",
        futureLayout: "kept by saves but ignored by readers",
      }),
    ).toEqual({ subtitle: "A Chronicle", author: "A. Writer" });
  });

  it("keeps compatible matter when one historical value is malformed", () => {
    expect(
      readBookMatter({
        dedication: "For the night readers",
        copyrightYear: 12,
        coverUrl: "https://assets.example.test/cover.png",
      }),
    ).toEqual({
      dedication: "For the night readers",
      coverUrl: "https://assets.example.test/cover.png",
    });
  });

  it("orders opening and closing pages and never creates blank sections", () => {
    const matter = readBookMatter({
      introduction: "  Welcome to the world. ",
      foreword: "A friend's opening.",
      afterword: "Looking back.",
      acknowledgments: "  ",
      aboutAuthor: "A brief biography.",
    });

    expect(openingBookMatter(matter).map((section) => section.title)).toEqual([
      "Foreword",
      "Introduction",
    ]);
    expect(closingBookMatter(matter).map((section) => section.title)).toEqual([
      "Afterword",
      "About the author",
    ]);
    expect(bookMatterPageCount(matter)).toBe(5); // title page + four populated sections
  });
});

describe("publishing kit", () => {
  const kit = {
    blurb: "  A cartographer walks a road that unmakes the world.  ",
    storeDescription: "The full listing copy.",
    keywords: [" epic fantasy maps ", "", "slow burn quest"],
    categories: ["Fiction > Fantasy > Epic"],
    authorBio: "A. Writer lives by the coast.",
  };

  it("reads a stored kit, trimming values and dropping empty entries", () => {
    expect(readPublishingKit(kit)).toEqual({
      blurb: "A cartographer walks a road that unmakes the world.",
      storeDescription: "The full listing copy.",
      keywords: ["epic fantasy maps", "slow burn quest"],
      categories: ["Fiction > Fantasy > Epic"],
      authorBio: "A. Writer lives by the coast.",
    });
  });

  it("treats a missing, empty, or wrongly shaped kit as no kit at all", () => {
    expect(readPublishingKit(undefined)).toBeUndefined();
    expect(readPublishingKit({})).toBeUndefined();
    expect(readPublishingKit({ blurb: "   ", keywords: [] })).toBeUndefined();
    expect(readPublishingKit(["not", "a", "kit"])).toBeUndefined();
    expect(readPublishingKit("blurb")).toBeUndefined();
  });

  it("keeps a partial kit — a book generated before a field existed still reads", () => {
    expect(readPublishingKit({ blurb: "Only the blurb survived.", keywords: [1, 2] })).toEqual({
      blurb: "Only the blurb survived.",
    });
  });

  it("caps stored lists at the schema's bounds so the whole kit stays parseable", () => {
    const stored = readPublishingKit({
      keywords: Array.from({ length: 25 }, (_, index) => `keyword ${index}`),
      categories: Array.from({ length: 25 }, (_, index) => `category ${index}`),
    });
    expect(stored?.keywords).toHaveLength(10);
    expect(stored?.categories).toHaveLength(5);
    expect(bookMatterSchema.partial().safeParse({ publishingKit: stored }).success).toBe(true);
  });

  it("rides along in front matter without disturbing the author's own pages", () => {
    const matter = readBookMatter({
      dedication: "For the night readers",
      coverUrl: "https://assets.example.test/cover.png",
      publishingKit: kit,
    });

    expect(matter.publishingKit?.blurb).toBe("A cartographer walks a road that unmakes the world.");
    expect(matter.dedication).toBe("For the night readers");
    expect(openingBookMatter(matter)).toEqual([]);
    expect(closingBookMatter(matter)).toEqual([]);
    // The kit sells the book; it is not a page inside it.
    expect(bookMatterPageCount(matter)).toBe(2);
  });

  it("drops only the kit when a historical kit is malformed", () => {
    const matter = readBookMatter({
      author: "A. Writer",
      publishingKit: { blurb: "x".repeat(5_000) },
    });

    expect(matter).toEqual({ author: "A. Writer" });
  });

  it("requires every field of a freshly generated kit", () => {
    expect(publishingKitSchema.safeParse(kit).success).toBe(true);
    expect(publishingKitSchema.safeParse({ blurb: "Only a blurb" }).success).toBe(false);
  });

  it("routes every draftable page to a real matter key", () => {
    for (const field of BOOK_MATTER_DRAFT_FIELDS) {
      expect(bookMatterSchema.shape[BOOK_MATTER_DRAFT_TARGET[field]]).toBeDefined();
    }
    expect(BOOK_MATTER_DRAFT_TARGET.epigraph).toBe("epigraphText");
  });
});
