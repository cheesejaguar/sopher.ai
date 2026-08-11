import { describe, expect, it, vi } from "vitest";

import type { DbTransaction } from "@/db";
import { recordMeteredDeliveryRefund } from "./meter";

describe("recordMeteredDeliveryRefund", () => {
  it("writes the idempotent delivery refund through the caller's transaction", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });
    const tx = { insert } as unknown as DbTransaction;

    await recordMeteredDeliveryRefund(tx, {
      userId: "user-1",
      credits: 0.25,
      description: "No actionable output — refunded",
      externalRefPrefix: "llm:review:attempt:one",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        amount: "0.25",
        kind: "adjustment",
        description: "No actionable output — refunded",
        externalRef: "delivery-refund:llm:review:attempt:one",
      }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });
});
