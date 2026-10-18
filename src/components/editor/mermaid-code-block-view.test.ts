import { describe, expect, it, vi } from "vitest";
import type { Node as PMNode } from "@tiptap/pm/model";

const mocks = vi.hoisted(() => ({ render: vi.fn(), initialize: vi.fn() }));

vi.mock("mermaid", () => ({
  default: { render: mocks.render, initialize: mocks.initialize },
}));

import { MermaidCodeBlockView } from "./mermaid-code-block-view";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("MermaidCodeBlockView", () => {
  it("never lets an older, slower render overwrite a newer diagram", async () => {
    vi.useFakeTimers();
    let source = "graph TD; A-->B";
    const node = {
      attrs: { language: "mermaid" },
      get textContent() {
        return source;
      },
    } as unknown as PMNode;

    const first = deferred<{ svg: string }>();
    const second = deferred<{ svg: string }>();
    mocks.render.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    // No chapter id: the upload path stays out of this test.
    const view = new MermaidCodeBlockView(node);
    const render = () => (view as unknown as { render(): Promise<void> }).render();
    vi.useRealTimers();

    const older = render();
    source = "graph TD; A-->C";
    const newer = render();
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));

    const [firstId] = mocks.render.mock.calls[0] as [string];
    const [secondId] = mocks.render.mock.calls[1] as [string];
    expect(firstId).not.toBe(secondId);

    second.resolve({ svg: "<svg data-v='newer'></svg>" });
    await newer;
    first.resolve({ svg: "<svg data-v='older'></svg>" });
    await older;

    const preview = view.dom.querySelector("[aria-hidden='true']");
    expect(preview?.innerHTML).toContain("newer");
    expect(preview?.innerHTML).not.toContain("older");
    view.destroy();
  });
});
