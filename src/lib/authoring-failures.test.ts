import { describe, expect, it } from "vitest";

import {
  authoringFailureExplanation,
  authoringFailureMessage,
  classifyAuthoringFailure,
} from "./authoring-failures";

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

  it("records nothing for a failure it cannot recognize", () => {
    expect(classifyAuthoringFailure(new Error("Something went sideways in the orchard"))).toEqual(
      {},
    );
  });

  it("keeps our own fatal preconditions readable in either realm", () => {
    expect(authoringFailureMessage(new Error("Chapter 3 was not prepared"))).toBe(
      "Chapter 3 was not prepared",
    );
    expect(authoringFailureMessage({ name: "FatalError", message: "Project not found" })).toBe(
      "Project not found",
    );
    expect(classifyAuthoringFailure(new Error("Project not found"))).toEqual({
      errorCode: "authoring_precondition",
    });
  });

  it("does not let provider text ride in on a precondition phrase", () => {
    expect(
      authoringFailureMessage(new Error("Project not found: the orchard chapter said Mira left")),
    ).toBe("An authoring precondition was not met. The step was not repeated.");
  });
});

/**
 * The 2026-08-04 production incident. A finished 12-chapter book was discarded
 * because the continuity review's structured output failed zod re-validation,
 * was retried four times identically, and then crossed the Workflow boundary as
 * a structured-clone plain object — where `instanceof Error` was false and the
 * only durable record became "Generation failed".
 */
describe("the continuity output-delivery incident", () => {
  const INCIDENT_MESSAGE =
    "continuity.narrative_structure ended before a complete result was available (finish reason: stop; 3742 output tokens).";
  const serializedWorkflowError = {
    name: "FatalError",
    message: INCIDENT_MESSAGE,
  };

  it("keeps the real message when the error is a plain structured-clone object", () => {
    expect(authoringFailureMessage(serializedWorkflowError)).toBe(INCIDENT_MESSAGE);
  });

  it("records the deterministic cause and the stage, not a generic cleanup code", () => {
    expect(classifyAuthoringFailure(serializedWorkflowError)).toEqual({
      errorCode: "provider_output_invalid",
      errorStage: "continuity",
    });
  });

  it("tells the author a truncated answer is worth another attempt but an unreadable one is not", () => {
    const truncated = classifyAuthoringFailure({
      name: "MeteredOutputDeliveryError",
      message:
        "writer.draft ended before a complete result was available (finish reason: length; 8000 output tokens).",
    });

    expect(truncated).toEqual({
      errorCode: "provider_output_truncated",
      errorStage: "chapters",
    });
    expect(authoringFailureExplanation({ errorCode: truncated.errorCode }).retry).toBe(
      "worth_retrying",
    );
    expect(authoringFailureExplanation({ errorCode: "provider_output_invalid" }).retry).toBe(
      "not_worth_retrying",
    );
  });

  it("separates a refusal from an unreadable answer", () => {
    expect(
      classifyAuthoringFailure({
        name: "MeteredOutputDeliveryError",
        message:
          "editor.edit ended before a complete result was available (finish reason: content-filter).",
      }),
    ).toEqual({ errorCode: "provider_content_filtered", errorStage: "editing" });
  });
});

describe("classifying provider and platform failures", () => {
  it.each([
    ["Rate limit exceeded for requests", "provider_rate_limited"],
    ["Request failed with status 429", "provider_rate_limited"],
    ["Provider returned 503", "provider_unavailable"],
    ["upstream connect error or disconnect/reset before headers", "provider_unavailable"],
    ["The model is overloaded. Please try again later.", "provider_unavailable"],
    ["Request timed out after 600000ms", "provider_timeout"],
    ["prompt is too long: 210000 tokens > 200000 maximum", "provider_input_limit"],
    ["Authoring cancellation requested", "authoring_cancelled"],
    ["Generation run is no longer active", "authoring_run_inactive"],
  ])("classifies %j as %s", (message, errorCode) => {
    expect(classifyAuthoringFailure(new Error(message)).errorCode).toBe(errorCode);
  });

  it("names the stage from our own input-limit guard", () => {
    expect(
      classifyAuthoringFailure(
        new Error(
          "outliner.outline input is too large (160000 bytes; maximum 152000 before provider schemas)",
        ),
      ),
    ).toEqual({ errorCode: "provider_input_limit", errorStage: "outline" });
  });

  it("survives a lifecycle stop that crossed the boundary as a plain object", () => {
    expect(
      authoringFailureMessage({ name: "FatalError", message: "Authoring cancellation requested" }),
    ).toBe("Authoring cancellation requested");
    expect(
      authoringFailureMessage({
        name: "FatalError",
        message: "Generation run is no longer active",
      }),
    ).toBe("Generation run is no longer active");
  });
});

describe("failure messages never carry provider or manuscript text", () => {
  const PROSE = "Mira set the lantern down and the orchard went quiet.";

  it("replaces a recognized provider failure with fixed operator wording", () => {
    const message = authoringFailureMessage(
      new Error(`503 Service Unavailable — the model returned: ${PROSE}`),
    );

    expect(message).toBe("The provider was unavailable for this call.");
    expect(message).not.toContain(PROSE);
  });

  it("ignores every field other than own name, message, and cause", () => {
    const message = authoringFailureMessage({
      name: "MeteredOutputDeliveryError",
      message:
        "continuity.narrative_structure ended before a complete result was available (finish reason: stop; 3742 output tokens).",
      prompt: PROSE,
      responseBody: PROSE,
      stack: PROSE,
    });

    expect(message).not.toContain(PROSE);
    expect(message).not.toContain("Mira");
  });

  it("refuses a message that only impersonates our own operator phrasing", () => {
    const message = authoringFailureMessage(
      new Error(
        `continuity.narrative_structure ended before a complete result was available. The draft so far: ${PROSE}`,
      ),
    );

    expect(message).toBe("A provider answer could not be delivered as a complete result.");
    expect(message).not.toContain(PROSE);
  });

  it("refuses an over-long or control-character-laden message", () => {
    const overLong = `${"continuity".repeat(40)}.phase ended before a complete result was available (finish reason: stop).`;

    expect(authoringFailureMessage(new Error(overLong))).toBe(
      "A provider answer could not be delivered as a complete result.",
    );
    expect(
      authoringFailureMessage(
        new Error(
          "continuity.narrative_structure ended before a complete result was available \n (finish reason: stop; 3742 output tokens).",
        ),
      ),
    ).toBe(
      "continuity.narrative_structure ended before a complete result was available (finish reason: stop; 3742 output tokens).",
    );
  });
});

describe("authoringFailureExplanation", () => {
  it("explains the incident to an author without an error code or jargon", () => {
    const explanation = authoringFailureExplanation({
      errorCode: "provider_output_invalid",
      errorStage: "continuity",
      savedChapterCount: 12,
    });

    expect(explanation.cause).toBe(
      "The Studio could not read the answer it got back during the final read-through for continuity.",
    );
    expect(explanation.preserved).toBe("All 12 chapters written so far are saved and safe.");
    expect(explanation.retry).toBe("not_worth_retrying");
    expect(
      [
        explanation.cause,
        explanation.preserved,
        explanation.retryStatement,
        explanation.nextStep,
      ].join(" "),
    ).not.toMatch(/provider_|finish reason|zod|schema|token/i);
  });

  it("falls back to honest wording when no cause was recorded", () => {
    const explanation = authoringFailureExplanation({ errorCode: null, savedChapterCount: 0 });

    expect(explanation.cause).toBe("Production stopped before the manuscript was finished.");
    expect(explanation.preserved).toBe("No chapter had been written yet, so nothing was lost.");
    expect(explanation.retry).toBe("worth_retrying");
  });

  it("tells an author to wait rather than retry a busy provider", () => {
    expect(authoringFailureExplanation({ errorCode: "provider_rate_limited" }).retry).toBe(
      "wait_and_retry",
    );
    expect(authoringFailureExplanation({ errorCode: "metered_output_missing" }).retry).toBe(
      "not_worth_retrying",
    );
  });

  it("uses singular wording for a single saved chapter", () => {
    expect(authoringFailureExplanation({ savedChapterCount: 1 }).preserved).toBe(
      "The chapter already written is saved and safe.",
    );
  });
});

describe("hardening against misreading a message", () => {
  it("refuses prose smuggled into the usage-detail slot", () => {
    // The generated shape only ever carries token counts there. A permissive
    // pattern would pass manuscript text straight into a persisted run row.
    expect(
      authoringFailureMessage(
        new Error(
          "continuity.x ended before a complete result was available (finish reason: stop; Mira set the lantern down).",
        ),
      ),
    ).toBe("A provider answer could not be delivered as a complete result.");
  });

  it("keeps the real generated message, with either token count", () => {
    for (const message of [
      "continuity.narrative_structure ended before a complete result was available (finish reason: stop; 3742 output tokens).",
      "writer.draft ended before a complete result was available (finish reason: length; 14000 output tokens, 512 reasoning tokens).",
    ]) {
      expect(authoringFailureMessage(new Error(message))).toBe(message);
    }
  });

  it.each([
    ["Chapter 512 draft could not be saved"],
    ["Summarizer produced 429 tokens of output"],
    ["writer.draft used 512 tokens"],
    ["Outline has 503 words"],
  ])("does not read a quantity as a provider outage: %j", (message) => {
    // Misreading these tells the author to wait a few minutes and retry
    // something that will never clear on its own.
    expect(classifyAuthoringFailure(new Error(message)).errorCode).toBeUndefined();
  });

  it.each([
    ["Provider returned 503", "provider_unavailable"],
    ["Gateway responded 502", "provider_unavailable"],
    ["HTTP 429 rate limit", "provider_rate_limited"],
  ])("still recognizes a real status code: %j", (message, code) => {
    expect(classifyAuthoringFailure(new Error(message)).errorCode).toBe(code);
  });

  it.each([
    ["No outline to write from"],
    ["Cannot finalize: expected 12 complete chapters, found 11"],
    ["Run cancelled while waiting for credits"],
    ["Credit input did not match the active pause"],
    ["This manuscript has no prose to review"],
  ])("keeps our own precondition messages diagnosable: %j", (message) => {
    // Collapsing these to "Generation failed" is the blindness that made the
    // 2026-08-04 incident impossible to diagnose from the run row alone.
    expect(authoringFailureMessage(new Error(message))).toBe(message);
    expect(classifyAuthoringFailure(new Error(message)).errorCode).toBe("authoring_precondition");
  });
});
