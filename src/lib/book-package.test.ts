import { describe, expect, it } from "vitest";

import {
  bookMatterPageCount,
  closingBookMatter,
  openingBookMatter,
  readBookMatter,
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
