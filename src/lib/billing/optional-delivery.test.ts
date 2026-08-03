import { describe, expect, it } from "vitest";

import { optionalDeliveryLeasePrefix, optionalDeliveryReceiptRef } from "./optional-delivery";

describe("optional delivery identities", () => {
  it("scopes immutable receipts to the project, resource, and caller key", () => {
    expect(
      optionalDeliveryReceiptRef({
        projectId: "project-1",
        resource: "portrait:entity-1",
        operationKey: "request-1",
      }),
    ).toBe("optional-delivery:project-1:portrait:entity-1:request-1");
  });

  it("matches every provider operation for one fully scoped optional action", () => {
    expect(
      optionalDeliveryLeasePrefix({
        userId: "user-1",
        meteringIdempotencyKey: "project:project-1:chapter:chapter-1:tool:illustration:request-1",
      }),
    ).toBe(
      "optional-operation-lease:metering-intent:interactive:user-1:" +
        "project:project-1:chapter:chapter-1:tool:illustration:request-1:",
    );
  });
});
