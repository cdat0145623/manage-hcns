import { describe, expect, it, vi } from "vitest";

import {
  groupPenaltyPolicies,
  resolveCurrentGlobalPenaltyPolicy,
  resolveGlobalPenaltyPolicyAtDate,
  selectPenaltyPolicy,
  loadPenaltySnapshotsForMasters,
} from "./taskPenaltyPolicy.repo";

describe("selectPenaltyPolicy", () => {
  it("uses a master override only inside the matching global policy period", () => {
    expect(
      selectPenaltyPolicy({
        priority: "high",
        globalPolicy: {
          publicId: "global-high",
          amountVnd: 200_000,
          effectiveFrom: new Date("2031-01-01T00:00:00.000Z"),
        },
        masterOverrideAmountVnd: 0,
      }),
    ).toEqual({
      priority: "high",
      amountVnd: 0,
      globalDefaultAmountVnd: 200_000,
      effectiveFrom: new Date("2031-01-01T00:00:00.000Z"),
      policyPublicId: "global-high",
      source: "master_override",
    });
  });

  it("does not apply a master override when the priority has no global period", () => {
    expect(
      selectPenaltyPolicy({
        priority: "high",
        masterOverrideAmountVnd: 100_000,
      }),
    ).toBeNull();
  });

  it("falls back to the global policy when no master override exists", () => {
    expect(
      selectPenaltyPolicy({
        priority: "medium",
        globalPolicy: {
          publicId: "global-medium",
          amountVnd: 100_000,
          effectiveFrom: new Date("2031-01-01T00:00:00.000Z"),
        },
      }),
    ).toEqual({
      priority: "medium",
      amountVnd: 100_000,
      globalDefaultAmountVnd: 100_000,
      effectiveFrom: new Date("2031-01-01T00:00:00.000Z"),
      policyPublicId: "global-medium",
      source: "global_policy",
    });
  });

  it("returns an empty snapshot for a task without priority", () => {
    expect(selectPenaltyPolicy({ priority: null })).toBeNull();
  });
});

describe("groupPenaltyPolicies", () => {
  it("groups the active admin revision and history for every priority", () => {
    const asOf = new Date("2026-08-25T05:00:00.000Z");
    const policies = [
      {
        publicId: "high-history",
        priority: "high" as const,
        amountVnd: 150_000,
        source: "global_policy" as const,
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-24T23:59:59.999Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        publicId: "high-current",
        priority: "high" as const,
        amountVnd: 200_000,
        source: "global_policy" as const,
        effectiveFrom: new Date("2026-08-25T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-31T23:59:59.999Z"),
        revision: 1,
        createdAt: new Date("2026-08-25T00:00:00.000Z"),
      },
      {
        publicId: "high-future",
        priority: "high" as const,
        amountVnd: 250_000,
        source: "global_policy" as const,
        effectiveFrom: new Date("2026-08-26T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-31T23:59:59.999Z"),
        revision: 2,
        createdAt: new Date("2026-08-26T00:00:00.000Z"),
      },
      {
        publicId: "medium-current",
        priority: "medium" as const,
        amountVnd: 100_000,
        source: "system_default" as const,
        effectiveFrom: new Date("2026-08-25T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-31T23:59:59.999Z"),
      },
      {
        publicId: "low-current",
        priority: "low" as const,
        amountVnd: 50_000,
        source: "system_default" as const,
        effectiveFrom: new Date("2026-08-25T00:00:00.000Z"),
        effectiveTo: null,
      },
    ];

    const result = groupPenaltyPolicies(policies, asOf);

    expect(result.map((item) => item.priority)).toEqual([
      "high",
      "medium",
      "low",
    ]);
    expect(result[0]).toMatchObject({
      current: { publicId: "high-current", amountVnd: 200_000 },
      history: [
        { publicId: "high-future", amountVnd: 250_000 },
        { publicId: "high-history", amountVnd: 150_000 },
      ],
    });
  });
});

describe("resolveGlobalPenaltyPolicyAtDate", () => {
  const policies = [
    {
      publicId: "high-august",
      priority: "high" as const,
      amountVnd: 200_000,
      source: "global_policy" as const,
      effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-08-30T23:59:59.999Z"),
      revision: 1,
      supersededAt: null,
    },
    {
      publicId: "high-overlap",
      priority: "high" as const,
      amountVnd: 250_000,
      source: "global_policy" as const,
      effectiveFrom: new Date("2026-08-15T00:00:00.000Z"),
      effectiveTo: new Date("2026-08-20T23:59:59.999Z"),
      revision: 2,
      supersededAt: null,
    },
  ];

  it("keeps both ends of an effective period inclusive", () => {
    expect(
      resolveGlobalPenaltyPolicyAtDate(
        policies,
        "high",
        new Date("2026-08-30T23:59:59.999Z"),
      ),
    ).toMatchObject({ publicId: "high-august", amountVnd: 200_000 });
  });

  it("returns no penalty policy outside every configured period", () => {
    expect(
      resolveGlobalPenaltyPolicyAtDate(
        policies,
        "high",
        new Date("2026-08-31T00:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("uses the later revision in an overlapping period", () => {
    expect(
      resolveGlobalPenaltyPolicyAtDate(
        policies,
        "high",
        new Date("2026-08-18T12:00:00.000Z"),
      ),
    ).toMatchObject({ publicId: "high-overlap", amountVnd: 250_000 });
  });
});

describe("resolveCurrentGlobalPenaltyPolicy", () => {
  it("uses the newest active admin policy regardless of former date ranges", () => {
    expect(
      resolveCurrentGlobalPenaltyPolicy(
        [
          {
            publicId: "older",
            priority: "high",
            amountVnd: 100_000,
            source: "global_policy",
            effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
            effectiveTo: new Date("2026-08-02T00:00:00.000Z"),
            revision: 1,
            supersededAt: new Date("2026-08-03T00:00:00.000Z"),
          },
          {
            publicId: "current",
            priority: "high",
            amountVnd: 250_000,
            source: "global_policy",
            effectiveFrom: new Date("2026-08-15T00:00:00.000Z"),
            effectiveTo: null,
            revision: 2,
            supersededAt: null,
          },
        ],
        "high",
      ),
    ).toMatchObject({ publicId: "current", amountVnd: 250_000 });
  });
});

describe("loadPenaltySnapshotsForMasters", () => {
  it("loads the shared policy dataset once for multiple masters", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        publicId: "global-high",
        priority: "high",
        amountVnd: 200_000,
        source: "global_policy",
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        effectiveTo: null,
        revision: 1,
        supersededAt: null,
      },
    ]);
    const db = { query: { taskPenaltyPolicies: { findMany } } } as never;

    const snapshots = await loadPenaltySnapshotsForMasters(db, [
      { id: "master-a", priority: "high" },
      { id: "master-b", priority: "high" },
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(snapshots.get("master-a")).toMatchObject({ amountVnd: 200_000 });
    expect(snapshots.get("master-b")).toMatchObject({ amountVnd: 200_000 });
  });
});
