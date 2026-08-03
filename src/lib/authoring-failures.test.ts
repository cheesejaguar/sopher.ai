import { describe, expect, it } from "vitest";

import { authoringFailureMessage, classifyAuthoringFailure } from "./authoring-failures";

describe("classifyAuthoringFailure", () => {
  it("preserves unresolved metering across a Workflow error boundary", () => {
    const message =
      "A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.";
    const serializedWorkflowError = new Error(message);
    serializedWorkflowError.name = "FatalError";

    expect(classifyAuthoringFailure(serializedWorkflowError)).toEqual({
      errorCode: "metering_reconciliation_required",
      incidentCategory: "unresolved_metering",
    });
  });

  it("separates settled usage with missing output from an open metering intent", () => {
    const error = new Error(
      "This logical provider call was already settled but its output checkpoint is missing. The call was not repeated.",
    );
    error.name = "MeteringReconciliationRequiredError";

    expect(classifyAuthoringFailure(error)).toEqual({
      errorCode: "metered_output_missing",
      incidentCategory: "completion_contradiction",
    });
    expect(authoringFailureMessage(error)).toBe(error.message);
  });

  it("also recognizes the original metering error name", () => {
    const originalError = new Error("provider outcome needs operator evidence");
    originalError.name = "MeteringReconciliationRequiredError";

    expect(classifyAuthoringFailure(originalError)).toEqual({
      errorCode: "metering_reconciliation_required",
      incidentCategory: "unresolved_metering",
    });
  });

  it("reads the safe message fields from a plain serialized Workflow error", () => {
    const serializedWorkflowError = {
      name: "FatalError",
      message:
        "A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.",
      prompt: "must never be stringified or persisted",
    };

    expect(authoringFailureMessage(serializedWorkflowError)).toBe(serializedWorkflowError.message);
    expect(classifyAuthoringFailure(serializedWorkflowError)).toEqual({
      errorCode: "metering_reconciliation_required",
      incidentCategory: "unresolved_metering",
    });
  });

  it("can recover the safe message from a serialized cause", () => {
    expect(
      authoringFailureMessage({
        name: "FatalError",
        cause: { message: "reconciliation is required" },
      }),
    ).toBe(
      "A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.",
    );
  });

  it("does not persist arbitrary messages from serialized Workflow objects", () => {
    expect(
      authoringFailureMessage({
        name: "ProviderError",
        message: "Sensitive prompt or generated prose",
      }),
    ).toBe("Generation failed");
  });

  it("does not misclassify ordinary provider failures", () => {
    expect(classifyAuthoringFailure(new Error("Provider returned 503"))).toEqual({});
  });
});
