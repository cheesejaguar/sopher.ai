import { describe, expect, it } from "vitest";
import { start } from "workflow/api";
import { spikeWorkflow } from "./spike";

describe("spikeWorkflow", () => {
  it("runs steps, streams to a namespace, and returns", async () => {
    const run = await start(spikeWorkflow, ["aaron"]);

    const result = await run.returnValue;
    expect(result).toEqual({ result: "greeted aaron" });

    const readable = run.getReadable<{ message: string }>({ namespace: "progress" });
    const reader = readable.getReader();
    const { value } = await reader.read();
    expect(value).toEqual({ message: "hello aaron" });
  });
});
