import { describe, expect, it } from "vitest";

import type { CreativeQuestion } from "@/ai/schemas";
import {
  creativeDecisionPayloadSchema,
  creativeDecisionPrompt,
  creativeQuestionDigest,
} from "@/lib/creative-decisions";

const question: CreativeQuestion = {
  question: "What should force Mara to leave the safety of the lighthouse?",
  rationale: "A personal reason gives the opening journey urgency and emotional weight.",
  options: [
    {
      id: "option-1",
      label: "A missing sibling",
      description: "Mara follows evidence that her brother survived the storm.",
    },
    {
      id: "option-2",
      label: "A broken promise",
      description: "An old vow compels Mara to guide a stranger across the flooded coast.",
    },
    {
      id: "option-3",
      label: "A town in danger",
      description: "Mara alone can carry a warning before the next impossible tide.",
    },
  ],
  recommendedOptionId: "option-1",
};

describe("creative decisions", () => {
  it("binds the complete question and recommendation to a stable digest", () => {
    expect(creativeQuestionDigest(question)).toBe(
      creativeQuestionDigest(structuredClone(question)),
    );
    expect(
      creativeQuestionDigest({
        ...question,
        recommendedOptionId: "option-2",
      }),
    ).not.toBe(creativeQuestionDigest(question));
  });

  it.each([
    {
      mode: "option",
      selectedOptionId: "option-2",
    },
    {
      mode: "custom",
      customResponse: "Make the lighthouse itself begin moving inland.",
    },
    { mode: "sopher" },
  ])("accepts the $mode response path", (choice) => {
    expect(
      creativeDecisionPayloadSchema.safeParse({
        questionId: "11111111-1111-4111-8111-111111111111",
        decisionDigest: creativeQuestionDigest(question),
        ...choice,
      }).success,
    ).toBe(true);
  });

  it("rejects ambiguous or empty response payloads", () => {
    const base = {
      questionId: "11111111-1111-4111-8111-111111111111",
      decisionDigest: creativeQuestionDigest(question),
    };
    expect(creativeDecisionPayloadSchema.safeParse({ ...base, mode: "option" }).success).toBe(
      false,
    );
    expect(
      creativeDecisionPayloadSchema.safeParse({
        ...base,
        mode: "custom",
        customResponse: "   ",
      }).success,
    ).toBe(false);
    expect(
      creativeDecisionPayloadSchema.safeParse({
        ...base,
        mode: "sopher",
        selectedOptionId: "option-1",
      }).success,
    ).toBe(false);
  });

  it("renders the accepted answer as binding outline guidance", () => {
    expect(
      creativeDecisionPrompt({
        creativeDecisions: {
          afterConcept: {
            questionId: "11111111-1111-4111-8111-111111111111",
            questionKey: "after_concept",
            mode: "sopher",
            selectedOptionId: "option-1",
            answer: "A missing sibling: Mara follows evidence that her brother survived.",
          },
        },
      }),
    ).toContain("The author chose this story direction");
  });
});
