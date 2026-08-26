import { describe, expect, it } from "vitest";

import { parsePenaltyPolicyActivityMetadata } from "./task-penalty-activity";

describe("parsePenaltyPolicyActivityMetadata", () => {
  it("accepts a master override with its global comparison amount", () => {
    expect(
      parsePenaltyPolicyActivityMetadata({
        version: 1,
        effectiveFrom: "2026-08-27T00:00:00.000Z",
        priority: "low",
        amountVnd: 100_000,
        source: "master_override",
        globalDefaultAmountVnd: 50_000,
        policyPublicId: "policy-public",
      }),
    ).toMatchObject({
      priority: "low",
      amountVnd: 100_000,
      source: "master_override",
      globalDefaultAmountVnd: 50_000,
    });
  });

  it("rejects malformed policy activity metadata", () => {
    expect(
      parsePenaltyPolicyActivityMetadata({
        version: 1,
        priority: "low",
        amountVnd: "100000",
      }),
    ).toBeNull();
  });
});
