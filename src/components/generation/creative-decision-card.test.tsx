import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreativeQuestionForAuthor } from "@/lib/creative-decisions";

import { CreativeDecisionCard, creativeDecisionCardKey } from "./creative-decision-card";

const question: CreativeQuestionForAuthor = {
  id: "11111111-1111-4111-8111-111111111111",
  questionKey: "after_concept" as const,
  question: "What should pull Mara beyond the lighthouse?",
  rationale: "This choice will shape the chapter plan.",
  options: [
    { id: "option-1" as const, label: "Family", description: "She searches for her brother." },
    { id: "option-2" as const, label: "Duty", description: "She carries a warning inland." },
    { id: "option-3" as const, label: "Wonder", description: "She follows an impossible map." },
  ],
  recommendedOptionId: "option-2" as const,
  decisionDigest: "a".repeat(64),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreativeDecisionCard", () => {
  it("shows exactly three suggestions, a custom response, and an explicit Sopher path", () => {
    render(<CreativeDecisionCard runId="run-1" question={question} />);

    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByText("Recommended")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Let Sopher decide" })).not.toBeNull();
    expect(
      screen.getByRole("group", { name: "Choose one story direction or write your own" }),
    ).not.toBeNull();
  });

  it("submits the recommendation path without inventing a custom answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onAccepted = vi.fn();
    render(<CreativeDecisionCard runId="run-1" question={question} onAccepted={onAccepted} />);

    fireEvent.click(screen.getByRole("button", { name: "Let Sopher decide" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      kind: "creative-decision",
      questionId: question.id,
      decisionDigest: question.decisionDigest,
      mode: "sopher",
    });
    await waitFor(() => expect(onAccepted).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toContain("Direction saved");
  });

  it("unlocks a stale answer and requests the latest question after a 409", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "This story question changed. Review the latest directions and choose again.",
          code: "stale_creative_question",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onRefreshRequested = vi.fn();
    render(
      <CreativeDecisionCard
        runId="run-1"
        question={question}
        onRefreshRequested={onRefreshRequested}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use this direction" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This story question changed");
    await waitFor(() => expect(onRefreshRequested).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Use this direction" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Let Sopher decide" })).toBeEnabled();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Let Sopher decide" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const retry = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      requestKey: string;
      mode: string;
    };
    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      requestKey: string;
    };
    expect(retry.mode).toBe("sopher");
    expect(retry.requestKey).not.toBe(first.requestKey);
  });

  it("remounts clean controls when the authoritative question identity changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const KeyedDecision = ({ current }: { current: typeof question }) => (
      <CreativeDecisionCard
        key={creativeDecisionCardKey(current)}
        runId="run-1"
        question={current}
      />
    );
    const { rerender } = render(<KeyedDecision current={question} />);

    fireEvent.click(screen.getByRole("button", { name: "Use this direction" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry saved answer" })).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );

    const refreshedQuestion = {
      ...question,
      question: "Which promise should Mara make before she leaves?",
      decisionDigest: "b".repeat(64),
      recommendedOptionId: "option-3" as const,
    };
    rerender(<KeyedDecision current={refreshedQuestion} />);

    expect(
      screen.getByRole("heading", { name: "Which promise should Mara make before she leaves?" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Use this direction" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Let Sopher decide" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Wonder/ })).toBeChecked();
  });
});
