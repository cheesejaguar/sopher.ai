import { calculateUsd } from "@/lib/billing/pricing";
import {
  canonicalizeCreditRequirement,
  CREDIT_MARKUP,
  creditsForUsd,
} from "@/lib/billing/credits-shared";
import { PROSE_FALLBACK_MODELS } from "./models";

export type MeteredOperationBudget = {
  /** Maximum input tokens for each SDK model step. */
  maxInputTokensPerStep: number;
  /** Enforced with the SDK's maxOutputTokens option on every call site. */
  maxOutputTokensPerStep: number;
  /** Exact stopWhen bound for tool loops; ordinary calls have one step. */
  maxProviderSteps: number;
  imageCount: number;
};

const DEFAULT_BUDGET: MeteredOperationBudget = {
  maxInputTokensPerStep: 64_000,
  maxOutputTokensPerStep: 8_000,
  maxProviderSteps: 1,
  imageCount: 0,
};

/**
 * Operation-specific safety envelopes.
 *
 * These are deliberately above the product's validated prompt/schema bounds
 * but far below a model's whole context window. Multi-step tool loops include
 * every provider step, because maxOutputTokens applies per step.
 */
const OPERATION_BUDGETS: Record<string, MeteredOperationBudget> = {
  "concept.expand": {
    maxInputTokensPerStep: 48_000,
    maxOutputTokensPerStep: 5_000,
    maxProviderSteps: 3,
    imageCount: 0,
  },
  "concept.refine": {
    maxInputTokensPerStep: 48_000,
    maxOutputTokensPerStep: 5_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "creative.question": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 2_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "outliner.plan": {
    maxInputTokensPerStep: 64_000,
    maxOutputTokensPerStep: 8_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "outliner.outline": {
    maxInputTokensPerStep: 96_000,
    maxOutputTokensPerStep: 20_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "outliner.selfCheck": {
    maxInputTokensPerStep: 128_000,
    maxOutputTokensPerStep: 20_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "entity.bible": {
    maxInputTokensPerStep: 160_000,
    maxOutputTokensPerStep: 32_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "writer.plan": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 4_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "writer.draft": {
    // Includes the frozen prompt plus several bounded story-bible/tool
    // responses carried forward by the SDK loop. The 127k envelope also keeps
    // a four-chapter standard wave inside the published Starter pack after
    // cold-cache and per-step ledger quantization are fully authorized.
    maxInputTokensPerStep: 127_000,
    maxOutputTokensPerStep: 14_000,
    maxProviderSteps: 3,
    imageCount: 0,
  },
  "writer.critique": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 4_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "writer.revise": {
    maxInputTokensPerStep: 40_000,
    maxOutputTokensPerStep: 14_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "summarizer.chapter": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 4_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "editor.edit": {
    maxInputTokensPerStep: 64_000,
    maxOutputTokensPerStep: 16_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "editor.review": {
    maxInputTokensPerStep: 96_000,
    maxOutputTokensPerStep: 12_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  // Proofreading reads a whole chapter and returns only short corrections, so
  // it needs review's input ceiling but a fraction of its output.
  "editor.proofread": {
    maxInputTokensPerStep: 96_000,
    maxOutputTokensPerStep: 8_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "editor.selection": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 8_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "publishing.kit": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 3_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "publishing.matter": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 1_200,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "tool.mermaid": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 4_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "tool.image.prompt": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 2_000,
    maxProviderSteps: 1,
    imageCount: 0,
  },
  "tool.image.generate": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 4_000,
    maxProviderSteps: 1,
    imageCount: 1,
  },
  "entity.portrait": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 4_000,
    maxProviderSteps: 1,
    imageCount: 1,
  },
  "cover.generate": {
    maxInputTokensPerStep: 32_000,
    maxOutputTokensPerStep: 4_000,
    maxProviderSteps: 1,
    imageCount: 1,
  },
};

export function meteredOperationBudget(operation: string): MeteredOperationBudget {
  if (operation.startsWith("continuity.")) {
    return {
      // A 60-chapter summary corpus plus bounded prose/entity spot checks.
      maxInputTokensPerStep: 160_000,
      maxOutputTokensPerStep: 8_000,
      maxProviderSteps: 5,
      imageCount: 0,
    };
  }
  return OPERATION_BUDGETS[operation] ?? DEFAULT_BUDGET;
}

const STATIC_PROVIDER_HEADROOM_TOKENS = 8_000;

export class MeteredInputLimitError extends Error {
  constructor(
    readonly operation: string,
    readonly bytes: number,
    readonly maximumBytes: number,
    readonly stepNumber?: number,
  ) {
    super(
      `${operation} input is too large (${bytes} bytes; maximum ${maximumBytes} before provider schemas)`,
    );
    this.name = "MeteredInputLimitError";
  }
}

/**
 * Enforces the priced input envelope immediately before each SDK provider
 * step. UTF-8 bytes are a conservative upper bound on BPE token count; the
 * remaining 8k-token allowance covers provider instructions, output schemas,
 * and tool definitions that are not represented in the message list.
 */
export function assertMeteredInputWithinBudget(
  operation: string,
  input: unknown,
  stepNumber?: number,
): void {
  const budget = meteredOperationBudget(operation);
  const maximumBytes = Math.max(1, budget.maxInputTokensPerStep - STATIC_PROVIDER_HEADROOM_TOKENS);
  const serialized = JSON.stringify(input) ?? "";
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > maximumBytes) {
    throw new MeteredInputLimitError(operation, bytes, maximumBytes, stepNumber);
  }
}

export function meteredInputGuard(operation: string) {
  return (options: { instructions?: unknown; messages: unknown; stepNumber?: number }) => {
    assertMeteredInputWithinBudget(
      operation,
      {
        instructions: options.instructions,
        messages: options.messages,
      },
      options.stepNumber,
    );
    return undefined;
  };
}

/** Use at every provider call so runtime output bounds match authorization. */
export function meteredMaxOutputTokens(operation: string, requested?: number): number {
  const maximum = meteredOperationBudget(operation).maxOutputTokensPerStep;
  return requested === undefined ? maximum : Math.min(maximum, Math.max(1, requested));
}

/**
 * Hard per-operation authorization ceiling. Expected book pricing remains
 * separate; this prices the costliest allowed model and every possible SDK
 * step before any provider request starts.
 */
export function meteredOperationCeilingUsd(input: {
  model: string;
  operation: string;
  minimumUsd?: number;
  maxOutputTokensPerStep?: number;
}): number {
  return meteredOperationCeilingCredits(input) / CREDIT_MARKUP;
}

/**
 * Canonical credit authorization for one logical provider call.
 *
 * The ledger stores numeric(12,4) and settlement quantizes each provider step
 * separately. Quantizing the costliest allowed step first, then summing those
 * exact four-decimal values, guarantees a max-step result fits its child claim.
 * Parent phase plans sum these same operation ceilings (via the USD adapter
 * above), so parallel child claims also fit an exact-balance phase hold.
 */
export function meteredOperationCeilingCredits(input: {
  model: string;
  operation: string;
  minimumUsd?: number;
  maxOutputTokensPerStep?: number;
}): number {
  const budget = meteredOperationBudget(input.operation);
  const outputTokens = meteredMaxOutputTokens(input.operation, input.maxOutputTokensPerStep);
  const allowedModels =
    input.operation === "writer.draft" || input.operation === "writer.revise"
      ? [input.model, ...PROSE_FALLBACK_MODELS]
      : [input.model];
  const operationCredits = Math.max(
    ...allowedModels.map((model) => {
      const ordinaryInput = calculateUsd(model, {
        inputTokens: budget.maxInputTokensPerStep,
        outputTokens,
        imageCount: budget.imageCount,
      });
      const coldCacheWrite = calculateUsd(model, {
        inputTokens: budget.maxInputTokensPerStep,
        cacheWriteTokens: budget.maxInputTokensPerStep,
        outputTokens,
        imageCount: budget.imageCount,
      });
      const perStepCredits = canonicalizeCreditRequirement(
        creditsForUsd(Math.max(ordinaryInput, coldCacheWrite)),
      );
      return perStepCredits * budget.maxProviderSteps;
    }),
  );
  const minimumCredits = canonicalizeCreditRequirement(creditsForUsd(input.minimumUsd ?? 0));
  return Math.max(minimumCredits, operationCredits);
}
