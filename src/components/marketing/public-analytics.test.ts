// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { publicVercelEvent } from "./public-analytics";

describe("public Vercel analytics filtering", () => {
  it("drops reader editions even if the analytics client survives a route transition", () => {
    expect(
      publicVercelEvent({
        type: "pageview",
        url: "https://sopher.ai/r/11111111-1111-4111-8111-111111111111",
      }),
    ).toBeNull();
  });

  it("keeps a public page while removing its query string", () => {
    expect(
      publicVercelEvent({ type: "pageview", url: "https://sopher.ai/pricing?campaign=test" }),
    ).toMatchObject({ url: "https://sopher.ai/pricing" });
  });
});
