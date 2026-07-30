import { describe, expect, it } from "vitest";

import { visibleDraftTabs } from "./live-draft-pane";

describe("visibleDraftTabs", () => {
  it("keeps the selected chapter mounted as newer chapters arrive", () => {
    expect(visibleDraftTabs([1, 2, 3, 4, 5, 6, 7], 1)).toEqual([1, 3, 4, 5, 6, 7]);
  });

  it("uses the newest six chapters when selection is already recent", () => {
    expect(visibleDraftTabs([1, 2, 3, 4, 5, 6, 7], 4)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("retains only the selected tab when a one-tab limit is requested", () => {
    expect(visibleDraftTabs([1, 2, 3], 1, 1)).toEqual([1]);
  });
});
