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
import {
  resolveCurrentGlobalPenaltyPolicy as resolveCurrentGlobalPenaltyPolicyCore,
  selectPenaltyPolicy as selectPenaltyPolicyCore,
} from "./taskPenaltyPolicy.resolver";
import type { PenaltyPolicyView, PenaltySnapshot } from "./taskPenaltyPolicy.resolver";

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

export type { PenaltySnapshot } from "./taskPenaltyPolicy.resolver";

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

export type { PenaltyPolicyView } from "./taskPenaltyPolicy.resolver";

export {
  groupPenaltyPolicies,
  resolveCurrentGlobalPenaltyPolicy,
  resolveGlobalPenaltyPolicyAtDate,
  selectPenaltyPolicy,
} from "./taskPenaltyPolicy.resolver";
export type { GroupedPenaltyPolicy } from "./taskPenaltyPolicy.resolver";

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
      ? resolveCurrentGlobalPenaltyPolicyCore(globalPolicies, priority)
      : null;
    snapshots.set(
      master.id,
      selectPenaltyPolicyCore({
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

export async function reconcilePendingPenaltySnapshotsInternal(
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

  // Resolve all affected masters in one policy query. The previous per-instance
  // lookup multiplied the same global-policy query by the number of instances.
  const masters = Array.from(
    new Map(
      candidates.map((candidate) => [candidate.taskMasterId, {
        id: candidate.taskMasterId,
        priority: candidate.masterPriority,
        overrideAmountVnd: candidate.masterOverrideAmountVnd,
      }]),
    ).values(),
  );
  const snapshotsByMaster = await loadPenaltySnapshotsForMasters(db, masters);

  for (const candidate of candidates) {
    if (!candidate.targetDate) continue;
    const snapshot = snapshotsByMaster.get(candidate.taskMasterId) ?? null;
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

    await reconcilePendingPenaltySnapshotsInternal(tx, {
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

    await reconcilePendingPenaltySnapshotsInternal(tx, {
      priority: input.priority,
      actorUserId: input.createdBy,
      defaultOnly: true,
    });

    return policy;
  });
}
