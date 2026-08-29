import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  cardActivities,
  taskInstances,
  taskMasterPenaltyPolicies,
  taskMasters,
  taskPenaltyAssessments,
  taskPenaltyPolicies,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const TASK_PENALTY_PRIORITIES = ["high", "medium", "low"] as const;

export type TaskPenaltyPriority = (typeof TASK_PENALTY_PRIORITIES)[number];

export type TaskPenaltySource =
  | "system_default"
  | "global_policy"
  | "master_override";

interface PolicyAmount {
  publicId: string;
  amountVnd: number;
  effectiveFrom: Date;
}

interface SelectPenaltyPolicyInput {
  priority: TaskPenaltyPriority | null;
  globalPolicy?: PolicyAmount & {
    source?: "system_default" | "global_policy";
  };
  masterOverrideAmountVnd?: number | null;
}

export interface PenaltySnapshot {
  priority: TaskPenaltyPriority;
  amountVnd: number;
  globalDefaultAmountVnd: number;
  effectiveFrom: Date;
  policyPublicId: string;
  source: TaskPenaltySource;
}

export interface PenaltyPolicyActivityMetadata {
  version: 1;
  effectiveFrom: string;
  priority: TaskPenaltyPriority;
  amountVnd: number;
  source: TaskPenaltySource;
  globalDefaultAmountVnd: number;
  policyPublicId: string;
  previous?: {
    priority: TaskPenaltyPriority | null;
    amountVnd: number | null;
    source: TaskPenaltySource | null;
  };
}

export interface PenaltyPolicyView {
  publicId: string;
  priority: TaskPenaltyPriority;
  amountVnd: number;
  source: TaskPenaltySource;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  revision?: number;
  supersededAt?: Date | null;
  createdAt?: Date;
}

/**
 * Resolves the policy that governs a calendar occurrence. Policies are never
 * inferred outside their explicit date range; when configured periods overlap,
 * the most recently saved revision wins.
 */
export function resolveGlobalPenaltyPolicyAtDate(
  policies: PenaltyPolicyView[],
  priority: TaskPenaltyPriority,
  date: Date,
): PenaltyPolicyView | null {
  return (
    policies
      .filter(
        (policy) =>
          policy.priority === priority &&
          policy.supersededAt === null &&
          policy.effectiveFrom <= date &&
          policy.effectiveTo !== null &&
          policy.effectiveTo >= date,
      )
      .sort(
        (left, right) =>
          (right.revision ?? 0) - (left.revision ?? 0) ||
          right.effectiveFrom.getTime() - left.effectiveFrom.getTime(),
      )[0] ?? null
  );
}

export interface GroupedPenaltyPolicy {
  priority: TaskPenaltyPriority;
  current: PenaltyPolicyView | null;
  history: PenaltyPolicyView[];
}

/**
 * Returns the one policy currently governing a priority. Effective-period
 * columns are retained for a future versioning feature but deliberately do
 * not participate in the current Daily Task penalty model.
 */
export function resolveCurrentGlobalPenaltyPolicy(
  policies: PenaltyPolicyView[],
  priority: TaskPenaltyPriority,
): PenaltyPolicyView | null {
  const newestFirst = (left: PenaltyPolicyView, right: PenaltyPolicyView) =>
    (right.revision ?? 0) - (left.revision ?? 0) ||
    (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0) ||
    right.effectiveFrom.getTime() - left.effectiveFrom.getTime();

  const currentAdminPolicy = policies
    .filter(
      (policy) =>
        policy.priority === priority &&
        policy.source === "global_policy" &&
        policy.supersededAt === null,
    )
    .sort(newestFirst)[0];

  if (currentAdminPolicy) return currentAdminPolicy;

  return (
    policies
      .filter(
        (policy) =>
          policy.priority === priority && policy.source === "system_default",
      )
      .sort(newestFirst)[0] ?? null
  );
}

export function groupPenaltyPolicies(
  policies: PenaltyPolicyView[],
  asOf: Date,
): GroupedPenaltyPolicy[] {
  return TASK_PENALTY_PRIORITIES.map((priority) => {
    const versions = policies.filter(
      (policy) =>
        policy.priority === priority && policy.source !== "system_default",
    );
    const current = versions
      .filter(
        (policy) =>
          policy.effectiveFrom <= asOf &&
          policy.effectiveTo !== null &&
          policy.effectiveTo >= asOf &&
          policy.supersededAt == null,
      )
      .sort(
        (left, right) =>
          (right.revision ?? 0) - (left.revision ?? 0) ||
          right.effectiveFrom.getTime() - left.effectiveFrom.getTime(),
      )[0];

    return {
      priority,
      current: current ?? null,
      history: versions
        .filter((policy) => policy.publicId !== current?.publicId)
        .sort(
          (left, right) =>
            (right.createdAt?.getTime() ?? 0) -
            (left.createdAt?.getTime() ?? 0),
        ),
    };
  });
}

export function selectPenaltyPolicy(
  input: SelectPenaltyPolicyInput,
): PenaltySnapshot | null {
  if (!input.priority) return null;

  if (
    input.globalPolicy &&
    input.masterOverrideAmountVnd !== null &&
    input.masterOverrideAmountVnd !== undefined
  ) {
    return {
      priority: input.priority,
      amountVnd: input.masterOverrideAmountVnd,
      globalDefaultAmountVnd: input.globalPolicy.amountVnd,
      effectiveFrom: input.globalPolicy.effectiveFrom,
      policyPublicId: input.globalPolicy.publicId,
      source: "master_override",
    };
  }

  if (!input.globalPolicy) return null;

  return {
    priority: input.priority,
    amountVnd: input.globalPolicy.amountVnd,
    globalDefaultAmountVnd: input.globalPolicy.amountVnd,
    effectiveFrom: input.globalPolicy.effectiveFrom,
    policyPublicId: input.globalPolicy.publicId,
    source: input.globalPolicy.source ?? "global_policy",
  };
}

export interface PenaltyMaster {
  id: string;
  priority: TaskPenaltyPriority | null;
  overrideAmountVnd?: number | null;
}

export type MasterPenaltyPolicyInput =
  | { priority: null }
  | { priority: TaskPenaltyPriority; amountMode: "default" }
  | {
      priority: TaskPenaltyPriority;
      amountMode: "override";
      overrideAmountVnd: number;
    };

/**
 * Resolves all snapshots for a calendar/materializer day with one global
 * policy query, avoiding one policy query per task master.
 */
export async function loadPenaltySnapshotsForMasters(
  db: dbClient,
  masters: PenaltyMaster[],
  _date?: Date,
): Promise<Map<string, PenaltySnapshot | null>> {
  const snapshots = new Map<string, PenaltySnapshot | null>();
  if (masters.length === 0) return snapshots;

  const priorities = Array.from(
    new Set(
      masters
        .map((master) => master.priority)
        .filter(
          (priority): priority is TaskPenaltyPriority => priority !== null,
        ),
    ),
  );
  const globalPolicies =
    priorities.length === 0
      ? []
      : await db.query.taskPenaltyPolicies.findMany({
          where: (policy) => inArray(policy.priority, priorities),
          orderBy: (policy) => [desc(policy.revision)],
        });

  for (const master of masters) {
    const priority = master.priority;
    const globalPolicy = priority
      ? resolveCurrentGlobalPenaltyPolicy(globalPolicies, priority)
      : null;
    snapshots.set(
      master.id,
      selectPenaltyPolicy({
        priority,
        masterOverrideAmountVnd: master.overrideAmountVnd,
        globalPolicy: globalPolicy
          ? {
              publicId: globalPolicy.publicId,
              amountVnd: globalPolicy.amountVnd,
              effectiveFrom: globalPolicy.effectiveFrom,
              source: globalPolicy.source as "system_default" | "global_policy",
            }
          : undefined,
      }),
    );
  }

  return snapshots;
}

const previousMoment = (date: Date) => new Date(date.getTime() - 1);

export async function scheduleMasterPenaltyPolicy(
  db: dbClient,
  input: {
    taskMasterId: string;
    policy: MasterPenaltyPolicyInput;
    effectiveFrom: Date;
    createdBy: string;
  },
) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`task-master-penalty:${input.taskMasterId}`}))`,
  );

  const active = await db.query.taskMasterPenaltyPolicies.findFirst({
    where: (policy) =>
      and(
        eq(policy.taskMasterId, input.taskMasterId),
        lte(policy.effectiveFrom, input.effectiveFrom),
        or(
          isNull(policy.effectiveTo),
          gte(policy.effectiveTo, input.effectiveFrom),
        ),
      ),
    orderBy: (policy) => [desc(policy.effectiveFrom)],
  });

  if (active && active.effectiveFrom < input.effectiveFrom) {
    await db
      .update(taskMasterPenaltyPolicies)
      .set({ effectiveTo: previousMoment(input.effectiveFrom) })
      .where(eq(taskMasterPenaltyPolicies.id, active.id));
  }

  await db
    .delete(taskMasterPenaltyPolicies)
    .where(
      and(
        eq(taskMasterPenaltyPolicies.taskMasterId, input.taskMasterId),
        gte(taskMasterPenaltyPolicies.effectiveFrom, input.effectiveFrom),
      ),
    );

  const [scheduled] = await db
    .insert(taskMasterPenaltyPolicies)
    .values({
      publicId: generateUID(),
      taskMasterId: input.taskMasterId,
      priority: input.policy.priority,
      overrideAmountVnd:
        input.policy.priority && input.policy.amountMode === "override"
          ? input.policy.overrideAmountVnd
          : null,
      effectiveFrom: input.effectiveFrom,
      createdBy: input.createdBy,
    })
    .returning({
      publicId: taskMasterPenaltyPolicies.publicId,
      priority: taskMasterPenaltyPolicies.priority,
      overrideAmountVnd: taskMasterPenaltyPolicies.overrideAmountVnd,
      effectiveFrom: taskMasterPenaltyPolicies.effectiveFrom,
      effectiveTo: taskMasterPenaltyPolicies.effectiveTo,
    });

  if (!scheduled) throw new Error("Failed to schedule master penalty policy");
  return scheduled;
}

export async function reconcilePendingPenaltySnapshots(
  db: dbClient,
  input: {
    actorUserId: string | null;
    taskMasterId?: string;
    priority?: TaskPenaltyPriority;
    defaultOnly?: boolean;
  },
) {
  const candidates = await db
    .select({
      id: taskInstances.id,
      taskMasterId: taskInstances.taskMasterId,
      targetDate: taskInstances.targetDate,
      status: taskInstances.status,
      masterPriority: taskMasters.priority,
      masterOverrideAmountVnd: taskMasters.penaltyOverrideAmountVnd,
      penaltyPriority: taskInstances.penaltyPriority,
      penaltyAmountVnd: taskInstances.penaltyAmountVnd,
      penaltySource: taskInstances.penaltySource,
      penaltyPolicyPublicId: taskInstances.penaltyPolicyPublicId,
      assessmentId: taskPenaltyAssessments.id,
      assessmentAmountVnd: taskPenaltyAssessments.amountVnd,
      assessmentSource: taskPenaltyAssessments.source,
      assessmentPolicyPublicId: taskPenaltyAssessments.policyPublicId,
      assessmentStatus: taskPenaltyAssessments.status,
    })
    .from(taskInstances)
    .innerJoin(taskMasters, eq(taskMasters.id, taskInstances.taskMasterId))
    .leftJoin(
      taskPenaltyAssessments,
      eq(taskPenaltyAssessments.taskInstanceId, taskInstances.id),
    )
    .where(
      and(
        eq(taskInstances.isDeleted, false),
        ...(input.taskMasterId
          ? [eq(taskInstances.taskMasterId, input.taskMasterId)]
          : []),
        ...(input.priority ? [eq(taskMasters.priority, input.priority)] : []),
        ...(input.defaultOnly
          ? [isNull(taskMasters.penaltyOverrideAmountVnd)]
          : []),
      ),
    );

  for (const candidate of candidates) {
    if (!candidate.targetDate) continue;
    const snapshots = await loadPenaltySnapshotsForMasters(db, [
      {
        id: candidate.taskMasterId,
        priority: candidate.masterPriority,
        overrideAmountVnd: candidate.masterOverrideAmountVnd,
      },
    ]);
    const snapshot = snapshots.get(candidate.taskMasterId) ?? null;
    const hasChanged =
      candidate.penaltyPriority !== (snapshot?.priority ?? null) ||
      candidate.penaltyAmountVnd !== (snapshot?.amountVnd ?? null) ||
      candidate.penaltySource !== (snapshot?.source ?? null) ||
      candidate.penaltyPolicyPublicId !== (snapshot?.policyPublicId ?? null);

    if (hasChanged) {
      await db
        .update(taskInstances)
        .set({
          penaltyPriority: snapshot?.priority ?? null,
          penaltyAmountVnd: snapshot?.amountVnd ?? null,
          penaltySource: snapshot?.source ?? null,
          penaltyPolicyPublicId: snapshot?.policyPublicId ?? null,
          penaltySnapshottedAt: snapshot ? new Date() : null,
        })
        .where(eq(taskInstances.id, candidate.id));

      if (snapshot) {
        const metadata: PenaltyPolicyActivityMetadata = {
          version: 1,
          effectiveFrom: snapshot.effectiveFrom.toISOString(),
          priority: snapshot.priority,
          amountVnd: snapshot.amountVnd,
          source: snapshot.source,
          globalDefaultAmountVnd: snapshot.globalDefaultAmountVnd,
          policyPublicId: snapshot.policyPublicId,
          previous: {
            priority: candidate.penaltyPriority,
            amountVnd: candidate.penaltyAmountVnd,
            source: candidate.penaltySource,
          },
        };
        await db.insert(cardActivities).values({
          publicId: generateUID(),
          taskInstanceId: candidate.id,
          type: "penalty_policy_applied",
          createdBy: input.actorUserId,
          metadata,
        });
      }
    }

    if (candidate.status !== "missed" && !candidate.assessmentId) continue;

    if (
      !snapshot &&
      candidate.assessmentId &&
      candidate.assessmentStatus === "active"
    ) {
      await db
        .update(taskPenaltyAssessments)
        .set({ status: "voided", voidedAt: new Date(), updatedAt: new Date() })
        .where(eq(taskPenaltyAssessments.id, candidate.assessmentId));
      await db.insert(cardActivities).values({
        publicId: generateUID(),
        taskInstanceId: candidate.id,
        type: "penalty_voided",
        createdBy: input.actorUserId,
        metadata: { reason: "policy_no_longer_applies" },
      });
      continue;
    }

    if (!snapshot) continue;

    if (!candidate.assessmentId) {
      await db.insert(taskPenaltyAssessments).values({
        publicId: generateUID(),
        taskInstanceId: candidate.id,
        amountVnd: snapshot.amountVnd,
        source: snapshot.source,
        policyPublicId: snapshot.policyPublicId,
      });
      await db.insert(cardActivities).values({
        publicId: generateUID(),
        taskInstanceId: candidate.id,
        type: "penalty_assessed",
        createdBy: input.actorUserId,
        metadata: {
          amountVnd: snapshot.amountVnd,
          currency: "VND",
          source: snapshot.source,
          policyPublicId: snapshot.policyPublicId,
        },
      });
      continue;
    }

    if (
      candidate.assessmentStatus !== "active" ||
      candidate.assessmentAmountVnd !== snapshot.amountVnd ||
      candidate.assessmentSource !== snapshot.source ||
      candidate.assessmentPolicyPublicId !== snapshot.policyPublicId
    ) {
      await db
        .update(taskPenaltyAssessments)
        .set({
          amountVnd: snapshot.amountVnd,
          source: snapshot.source,
          policyPublicId: snapshot.policyPublicId,
          status: "active",
          voidedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(taskPenaltyAssessments.id, candidate.assessmentId));
      await db.insert(cardActivities).values({
        publicId: generateUID(),
        taskInstanceId: candidate.id,
        type: "penalty_recalculated",
        createdBy: input.actorUserId,
        metadata: {
          previousAmountVnd: candidate.assessmentAmountVnd,
          amountVnd: snapshot.amountVnd,
          source: snapshot.source,
          policyPublicId: snapshot.policyPublicId,
        },
      });
    }
  }

  return candidates.length;
}

export async function scheduleGlobalPenaltyPolicy(
  db: dbClient,
  input: {
    priority: TaskPenaltyPriority;
    amountVnd: number;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    createdBy: string;
  },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`global-task-penalty:${input.priority}`}))`,
    );

    const fallbackFrom = input.effectiveTo
      ? new Date(input.effectiveTo.getTime() + 1)
      : null;
    const active = await tx.query.taskPenaltyPolicies.findFirst({
      where: (policy) =>
        and(
          eq(policy.priority, input.priority),
          lte(policy.effectiveFrom, input.effectiveFrom),
          or(
            isNull(policy.effectiveTo),
            gte(policy.effectiveTo, input.effectiveFrom),
          ),
        ),
      orderBy: (policy) => [desc(policy.effectiveFrom)],
    });
    const fallback = fallbackFrom
      ? await tx.query.taskPenaltyPolicies.findFirst({
          where: (policy) =>
            and(
              eq(policy.priority, input.priority),
              lte(policy.effectiveFrom, fallbackFrom),
              or(
                isNull(policy.effectiveTo),
                gte(policy.effectiveTo, fallbackFrom),
              ),
            ),
          orderBy: (policy) => [desc(policy.effectiveFrom)],
        })
      : null;

    if (active && active.effectiveFrom < input.effectiveFrom) {
      await tx
        .update(taskPenaltyPolicies)
        .set({ effectiveTo: previousMoment(input.effectiveFrom) })
        .where(eq(taskPenaltyPolicies.id, active.id));
    }

    await tx
      .delete(taskPenaltyPolicies)
      .where(
        and(
          eq(taskPenaltyPolicies.priority, input.priority),
          gte(taskPenaltyPolicies.effectiveFrom, input.effectiveFrom),
          ...(input.effectiveTo
            ? [lte(taskPenaltyPolicies.effectiveFrom, input.effectiveTo)]
            : []),
        ),
      );

    const [scheduled] = await tx
      .insert(taskPenaltyPolicies)
      .values({
        publicId: generateUID(),
        priority: input.priority,
        amountVnd: input.amountVnd,
        source: "global_policy",
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        createdBy: input.createdBy,
      })
      .returning({
        publicId: taskPenaltyPolicies.publicId,
        priority: taskPenaltyPolicies.priority,
        amountVnd: taskPenaltyPolicies.amountVnd,
        effectiveFrom: taskPenaltyPolicies.effectiveFrom,
        effectiveTo: taskPenaltyPolicies.effectiveTo,
      });

    if (!scheduled) throw new Error("Failed to schedule penalty policy");

    const fallbackPolicy = fallback ?? active;
    if (fallbackPolicy && fallbackFrom) {
      const existingAtFallback = await tx.query.taskPenaltyPolicies.findFirst({
        where: (policy) =>
          and(
            eq(policy.priority, input.priority),
            eq(policy.effectiveFrom, fallbackFrom),
          ),
      });
      if (!existingAtFallback) {
        const nextPolicy = await tx.query.taskPenaltyPolicies.findFirst({
          where: (policy) =>
            and(
              eq(policy.priority, input.priority),
              gte(policy.effectiveFrom, fallbackFrom),
            ),
          orderBy: (policy) => [asc(policy.effectiveFrom)],
        });
        const fallbackTo = nextPolicy
          ? previousMoment(nextPolicy.effectiveFrom)
          : fallbackPolicy.effectiveTo;
        await tx.insert(taskPenaltyPolicies).values({
          publicId: generateUID(),
          priority: fallbackPolicy.priority,
          amountVnd: fallbackPolicy.amountVnd,
          source: fallbackPolicy.source,
          effectiveFrom: fallbackFrom,
          effectiveTo: fallbackTo,
          createdBy: input.createdBy,
        });
      }
    }

    await reconcilePendingPenaltySnapshots(tx, {
      priority: input.priority,
      actorUserId: input.createdBy,
      defaultOnly: true,
    });

    return scheduled;
  });
}

/**
 * Appends a global-policy revision. Existing policies are never interval-split
 * or deleted: a later revision simply wins where its explicit period overlaps.
 */
export async function saveGlobalPenaltyPolicy(
  db: dbClient,
  input: {
    priority: TaskPenaltyPriority;
    amountVnd: number;
    createdBy: string;
  },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`global-task-penalty:${input.priority}`}))`,
    );

    await tx
      .update(taskPenaltyPolicies)
      .set({ supersededAt: new Date(), supersededBy: input.createdBy })
      .where(
        and(
          eq(taskPenaltyPolicies.priority, input.priority),
          eq(taskPenaltyPolicies.source, "global_policy"),
          isNull(taskPenaltyPolicies.supersededAt),
        ),
      );

    const [latestRevision] = await tx
      .select({
        revision: sql<number>`coalesce(max(${taskPenaltyPolicies.revision}), 0)`,
      })
      .from(taskPenaltyPolicies)
      .where(eq(taskPenaltyPolicies.priority, input.priority));
    const revision = (latestRevision?.revision ?? 0) + 1;

    const [policy] = await tx
      .insert(taskPenaltyPolicies)
      .values({
        publicId: generateUID(),
        priority: input.priority,
        amountVnd: input.amountVnd,
        source: "global_policy",
        effectiveFrom: new Date(),
        effectiveTo: null,
        revision,
        createdBy: input.createdBy,
      })
      .returning({
        publicId: taskPenaltyPolicies.publicId,
        priority: taskPenaltyPolicies.priority,
        amountVnd: taskPenaltyPolicies.amountVnd,
        effectiveFrom: taskPenaltyPolicies.effectiveFrom,
        effectiveTo: taskPenaltyPolicies.effectiveTo,
        revision: taskPenaltyPolicies.revision,
      });

    if (!policy) throw new Error("Failed to save penalty policy");

    await reconcilePendingPenaltySnapshots(tx, {
      priority: input.priority,
      actorUserId: input.createdBy,
      defaultOnly: true,
    });

    return policy;
  });
}
