import { and, eq, inArray, sql } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  cardRewardConfigs,
  cardRewardDeductions,
  cardRewardLogs,
  cardRewardSnapshots,
  taskInstances,
  taskMasters,
} from "@kan/db/schema";
import { createLogger } from "@kan/logger";
import { REWARD_DEDUCTION_REASON } from "@kan/shared/constants";

const log = createLogger("reward-violation");

/** Trạng thái config được phép chuyển sang waiting_evaluation khi công việc hoàn thành */
const APPROVAL_STATUSES_BEFORE_EVALUATION = [
  "approved",
  "draft",
  "rejected",
  "waiting_approval",
] as const;

export type RewardViolationType =
  | "deadline_extended"
  | "deadline_shortened"
  | "start_date_changed"
  | "assignee_changed";

export type RewardConfigViolationType =
  | "reward_config_changed"
  | "deduction_changed"
  | "finalization_created";

interface ViolationCandidate {
  violationType: RewardViolationType;
  beforeValue: unknown;
  afterValue: unknown;
}

/**
 * Detects reward violations by comparing new card values against the snapshot
 * taken at approval time, then atomically downgrades the config to DRAFT.
 *
 * Concurrency model:
 *   1. Compare new values vs snapshot → collect candidates
 *   2. Attempt atomic downgrade:
 *        UPDATE … WHERE approvalStatus = 'approved' RETURNING id
 *   3. If RETURNING returns a row → won the race → bulk-insert all logs
 *      If RETURNING returns nothing → already downgraded → skip
 */
export async function trackCardRewardViolations({
  db,
  cardId,
  newDueDate,
  newStartDate,
  memberAction,
}: {
  db: dbClient;
  cardId: number;
  newDueDate?: Date | null;
  newStartDate?: Date | null;
  memberAction?: {
    workspaceMemberId: number;
    action: "added" | "removed";
  };
}): Promise<void> {
  if (newDueDate === undefined && newStartDate === undefined && !memberAction) {
    return;
  }

  try {
    await db.transaction(async (tx) => {
      // Step 1: Find the APPROVED config + snapshot
      const config = await tx.query.cardRewardConfigs.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.cardId, cardId), eq(t.approvalStatus, "approved")),
      });

      if (!config) return;

      const snapshot = await tx.query.cardRewardSnapshots.findFirst({
        where: eq(cardRewardSnapshots.configId, config.id),
      });

      // Step 2: Compare new values vs snapshot
      const candidates: ViolationCandidate[] = [];

      if (newDueDate !== undefined && newDueDate !== null) {
        const snappedDue = snapshot?.snappedDueDate ?? null;
        if (snappedDue) {
          if (newDueDate.getTime() > snappedDue.getTime()) {
            candidates.push({
              violationType: "deadline_extended",
              beforeValue: snappedDue.toISOString(),
              afterValue: newDueDate.toISOString(),
            });
          } else if (newDueDate.getTime() < snappedDue.getTime()) {
            candidates.push({
              violationType: "deadline_shortened",
              beforeValue: snappedDue.toISOString(),
              afterValue: newDueDate.toISOString(),
            });
          }
        }
      }

      if (newStartDate !== undefined && newStartDate !== null) {
        const snappedStart = snapshot?.snappedStartDate ?? null;
        if (
          !snappedStart ||
          newStartDate.getTime() !== snappedStart.getTime()
        ) {
          candidates.push({
            violationType: "start_date_changed",
            beforeValue: snappedStart?.toISOString() ?? null,
            afterValue: newStartDate.toISOString(),
          });
        }
      }

      if (memberAction) {
        candidates.push({
          violationType: "assignee_changed",
          beforeValue:
            memberAction.action === "removed"
              ? { workspaceMemberId: memberAction.workspaceMemberId }
              : null,
          afterValue:
            memberAction.action === "added"
              ? { workspaceMemberId: memberAction.workspaceMemberId }
              : null,
        });
      }

      if (candidates.length === 0) return;

      // Step 3: Atomic downgrade — the concurrency gate
      const { rows: downgraded } = await tx.execute<{ id: number }>(
        sql`
          UPDATE "card_reward_configs"
          SET    "approvalStatus" = 'draft',
                 "updatedAt"      = now()
          WHERE  id               = ${config.id}
            AND  "approvalStatus" = 'approved'
          RETURNING id
        `,
      );

      if (!downgraded.length) {
        log.debug(
          { configId: config.id, cardId },
          "Reward violation: concurrency skip — config already downgraded",
        );
        return;
      }

      log.info(
        {
          configId: config.id,
          cardId,
          violations: candidates.map((c) => c.violationType),
        },
        "Reward config auto-downgraded to draft due to violations (logs will be recorded on approval)",
      );
    });
  } catch (error) {
    log.error({ err: error, cardId }, "trackCardRewardViolations failed");
  }
}

/**
 * Audit log for reward config / deduction / finalization changes.
 * Called after the corresponding card_activity is inserted.
 *
 * auto-downgrade behaviour:
 *   "reward_config_changed" | "deduction_changed"
 *     → Atomically downgrade config APPROVED or WAITING_APPROVAL → DRAFT,
 *       then insert the violation log.
 *       (Concurrency-safe: UPDATE … RETURNING acts as the exclusive gate.)
 *       If status is already DRAFT/REJECTED → insert log only (still audit trail).
 *   "finalization_created"
 *     → Pure audit: insert log, no status change.
 */
export async function logConfigAudit({
  db,
  configId,
  violationType,
  beforeValue,
  afterValue,
}: {
  db: dbClient;
  configId: number;
  violationType: RewardConfigViolationType;
  beforeValue: unknown;
  afterValue: unknown;
}): Promise<void> {
  try {
    if (
      violationType === "reward_config_changed" ||
      violationType === "deduction_changed"
    ) {
      // ── Auto-downgrade path ─────────────────────────────────────────────
      await db.transaction(async (tx) => {
        // Atomic gate: downgrade if config is still in an approvable state.
        // Targets both APPROVED (shouldn't be editable, but defensive) and
        // WAITING_APPROVAL (user edited after submitting → pull back to draft).
        const { rows: downgraded } = await tx.execute<{ id: number }>(
          sql`
            UPDATE "card_reward_configs"
            SET    "approvalStatus" = 'draft',
                   "updatedAt"      = now()
            WHERE  id               = ${configId}
              AND  "approvalStatus" IN ('approved', 'waiting_approval')
            RETURNING id
          `,
        );

        if (downgraded.length) {
          log.info(
            { configId, violationType },
            "Config auto-downgraded to draft due to changes (logs will be recorded on approval)",
          );
        } else {
          log.debug(
            { configId, violationType },
            "Config changed but no downgrade needed (already draft/rejected)",
          );
        }
      });
    } else {
      // ── Pure audit path (finalization_created) ──────────────────────────
      await db.insert(cardRewardLogs).values({
        configId,
        violationType,
        beforeValue: beforeValue as Record<string, unknown>,
        afterValue: afterValue as Record<string, unknown>,
        detectedAt: new Date(),
      });
      log.debug({ configId, violationType }, "Finalization audit log inserted");
    }
  } catch (error) {
    log.error({ err: error, configId, violationType }, "logConfigAudit failed");
  }
}

/**
 * Same logic as trackCardRewardViolations but looks up the config via taskInstanceId.
 *
 * Call this from taskInstance.update when endDate or userId changes.
 *
 * @param taskInstanceId - the taskInstance UUID
 * @param newDueDate - the newly-derived dueDate (taskInstance.endDate)
 * @param newStartDate - the new startDate (taskInstance.targetDate)
 * @param newTargetUser - the new assignee UUID
 */
export async function trackTaskInstanceRewardViolations({
  db,
  taskInstanceId,
  newDueDate,
  newStartDate,
  newTargetUser,
}: {
  db: dbClient;
  taskInstanceId: string;
  newDueDate?: Date | null;
  newStartDate?: Date | null;
  newTargetUser?: string | null;
}): Promise<void> {
  if (
    newDueDate === undefined &&
    newStartDate === undefined &&
    newTargetUser === undefined
  ) {
    return;
  }

  try {
    await db.transaction(async (tx) => {
      // Find the APPROVED config + snapshot for this taskInstance
      const config = await tx.query.cardRewardConfigs.findFirst({
        where: (t, { and, eq }) =>
          and(
            eq(t.taskInstanceId, taskInstanceId),
            eq(t.approvalStatus, "approved"),
          ),
      });

      if (!config) return;

      const snapshot = await tx.query.cardRewardSnapshots.findFirst({
        where: eq(cardRewardSnapshots.configId, config.id),
      });

      const candidates: ViolationCandidate[] = [];

      // 1. dueDate changed
      if (newDueDate !== undefined && newDueDate !== null) {
        const snappedDue = snapshot?.snappedDueDate ?? null;
        if (snappedDue) {
          if (newDueDate.getTime() > snappedDue.getTime()) {
            candidates.push({
              violationType: "deadline_extended",
              beforeValue: snappedDue.toISOString(),
              afterValue: newDueDate.toISOString(),
            });
          } else if (newDueDate.getTime() < snappedDue.getTime()) {
            candidates.push({
              violationType: "deadline_shortened",
              beforeValue: snappedDue.toISOString(),
              afterValue: newDueDate.toISOString(),
            });
          }
        }
      }

      // 2. startDate changed
      if (newStartDate !== undefined && newStartDate !== null) {
        const snappedStart = snapshot?.snappedStartDate ?? null;
        if (
          !snappedStart ||
          newStartDate.getTime() !== snappedStart.getTime()
        ) {
          candidates.push({
            violationType: "start_date_changed",
            beforeValue: snappedStart?.toISOString() ?? null,
            afterValue: newStartDate.toISOString(),
          });
        }
      }

      // 3. targetUser (assignee) changed
      if (newTargetUser !== undefined) {
        const snappedUser = snapshot?.snappedTargetUser ?? null;
        if (newTargetUser !== snappedUser) {
          candidates.push({
            violationType: "assignee_changed",
            beforeValue: { targetUser: snappedUser },
            afterValue: { targetUser: newTargetUser },
          });
        }
      }

      if (candidates.length === 0) return;

      // Atomic downgrade
      const { rows: downgraded } = await tx.execute<{ id: number }>(
        sql`
          UPDATE "card_reward_configs"
          SET    "approvalStatus" = 'draft',
                 "updatedAt"      = now()
          WHERE  id               = ${config.id}
            AND  "approvalStatus" = 'approved'
          RETURNING id
        `,
      );

      if (!downgraded.length) {
        log.debug(
          { configId: config.id, taskInstanceId },
          "TaskInstance reward violation: concurrency skip — config already downgraded",
        );
        return;
      }

      log.info(
        {
          configId: config.id,
          taskInstanceId,
          violations: candidates.map((c) => c.violationType),
        },
        "TaskInstance reward config auto-downgraded to draft due to violations",
      );
    });
  } catch (error) {
    log.error(
      { err: error, taskInstanceId },
      "trackTaskInstanceRewardViolations failed",
    );
  }
}

/**
 * Transitions the taskInstance's reward config to waiting_evaluation.
 * Called when a taskInstance status is moved to 'done'.
 */
export async function markTaskInstanceConfigWaitingEvaluation({
  db,
  taskInstanceId,
  dueDate,
  completedAt,
}: {
  db: dbClient;
  taskInstanceId: string;
  dueDate?: Date | null;
  completedAt?: Date;
}): Promise<void> {
  try {
    const rows = await db
      .update(cardRewardConfigs)
      .set({
        approvalStatus: "waiting_evaluation",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cardRewardConfigs.taskInstanceId, taskInstanceId),
          inArray(cardRewardConfigs.approvalStatus, [
            ...APPROVAL_STATUSES_BEFORE_EVALUATION,
          ]),
        ),
      )
      .returning({ id: cardRewardConfigs.id });

    if (rows.length > 0) {
      const configId = rows[0]?.id;
      log.info(
        { taskInstanceId, configId },
        "TaskInstance marked as done — reward config auto-transitioned to waiting_evaluation",
      );
      if (configId != null && completedAt) {
        await recordLateCompletionRewardLog({
          db,
          configId,
          dueDate: dueDate ?? null,
          completedAt,
        });
      }
    }
  } catch (error) {
    log.error(
      { err: error, taskInstanceId },
      "markTaskInstanceConfigWaitingEvaluation failed",
    );
  }
}

/**
 * Reverts the taskInstance's reward config back to APPROVED if the instance is re-opened.
 * Only targets configs that are currently WAITING_EVALUATION.
 * NEVER reverts if status is COMPLETED.
 */
export async function revertTaskInstanceConfigToApproved({
  db,
  taskInstanceId,
}: {
  db: dbClient;
  taskInstanceId: string;
}): Promise<void> {
  try {
    const rows = await db
      .update(cardRewardConfigs)
      .set({
        approvalStatus: "approved",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cardRewardConfigs.taskInstanceId, taskInstanceId),
          eq(cardRewardConfigs.approvalStatus, "waiting_evaluation"),
        ),
      )
      .returning({ id: cardRewardConfigs.id });

    if (rows.length > 0) {
      const configId = rows[0]?.id;
      if (configId != null) {
        await deleteLateCompletionRewardLogsForConfig(db, configId);
      }
      log.info(
        { taskInstanceId, configId: rows[0]?.id },
        "TaskInstance re-opened — reward config auto-reverted to approved",
      );
    }
  } catch (error) {
    log.error(
      { err: error, taskInstanceId },
      "revertTaskInstanceConfigToApproved failed",
    );
  }
}

async function deleteLateCompletionRewardLogsForConfig(
  db: dbClient,
  configId: number,
): Promise<void> {
  await db
    .delete(cardRewardLogs)
    .where(
      and(
        eq(cardRewardLogs.configId, configId),
        eq(cardRewardLogs.violationType, "completed_after_deadline"),
      ),
    );
}

/**
 * Khi hoàn thành sau deadline: gắn log + khấu trừ loại trễ hạn (late_deadline) để nghiệm thu tính đúng.
 * Quy tắc đúng hạn: completedAt &lt; dueDate (cùng logic ưu tiên với dashboard on-time).
 */
export async function recordLateCompletionRewardLog({
  db,
  configId,
  dueDate,
  completedAt,
}: {
  db: dbClient;
  configId: number;
  dueDate: Date | null;
  completedAt: Date;
}): Promise<void> {
  try {
    if (!dueDate) return;
    if (completedAt.getTime() < dueDate.getTime()) return;

    const deductions = await db.query.cardRewardDeductions.findMany({
      where: eq(cardRewardDeductions.configId, configId),
    });
    const lateRow = deductions.find(
      (d) => d.reason === REWARD_DEDUCTION_REASON.LATE,
    );
    if (!lateRow) {
      log.warn(
        { configId },
        "Late completion: no late_deadline deduction row on config",
      );
      return;
    }

    await deleteLateCompletionRewardLogsForConfig(db, configId);

    await db.insert(cardRewardLogs).values({
      configId,
      violationType: "completed_after_deadline",
      deductionId: lateRow.id,
      beforeValue: { dueDate: dueDate.toISOString() },
      afterValue: { completedAt: completedAt.toISOString() },
      detectedAt: completedAt,
      isSkipped: false,
    });

    log.info(
      {
        configId,
        dueDate: dueDate.toISOString(),
        completedAt: completedAt.toISOString(),
      },
      "Recorded late completion reward log (completed_after_deadline)",
    );
  } catch (error) {
    log.error({ err: error, configId }, "recordLateCompletionRewardLog failed");
  }
}

/**
 * Transitions the card's reward config to waiting_evaluation when work is completed.
 * Only targets configs that are either APPROVED or DRAFT (so we don't accidentally
 * override a config already being evaluated or rejected/completed).
 * This locks out the penalty API (since it only targets 'approved' configs).
 */
export async function markConfigWaitingEvaluation({
  db,
  cardId,
  dueDate,
  completedAt,
}: {
  db: dbClient;
  cardId: number;
  /** Deadline hiện tại của thẻ (so sánh với thời điểm hoàn thành). */
  dueDate?: Date | null;
  /** Thời điểm chuyển sang hoàn thành (thường là now). */
  completedAt?: Date;
}): Promise<void> {
  try {
    const rows = await db
      .update(cardRewardConfigs)
      .set({
        approvalStatus: "waiting_evaluation",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cardRewardConfigs.cardId, cardId),
          inArray(cardRewardConfigs.approvalStatus, [
            ...APPROVAL_STATUSES_BEFORE_EVALUATION,
          ]),
        ),
      )
      .returning({ id: cardRewardConfigs.id });

    if (rows.length > 0) {
      const configId = rows[0]?.id;
      log.info(
        { cardId, configId },
        "Card marked as done — reward config auto-transitioned to waiting_evaluation",
      );
      if (configId != null && completedAt) {
        await recordLateCompletionRewardLog({
          db,
          configId,
          dueDate: dueDate ?? null,
          completedAt,
        });
      }
    }
  } catch (error) {
    log.error({ err: error, cardId }, "markConfigWaitingEvaluation failed");
  }
}

/**
 * Reverts the config back to APPROVED if a card is marked as undone.
 * Only targets configs that are currently WAITING_EVALUATION.
 */
export async function revertConfigToApproved({
  db,
  cardId,
}: {
  db: dbClient;
  cardId: number;
}): Promise<void> {
  try {
    const rows = await db
      .update(cardRewardConfigs)
      .set({
        approvalStatus: "approved",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cardRewardConfigs.cardId, cardId),
          eq(cardRewardConfigs.approvalStatus, "waiting_evaluation"),
        ),
      )
      .returning({ id: cardRewardConfigs.id });

    if (rows.length > 0) {
      const configId = rows[0]?.id;
      if (configId != null) {
        await deleteLateCompletionRewardLogsForConfig(db, configId);
      }
      log.info(
        { cardId, configId: rows[0]?.id },
        "Card marked as undone — reward config auto-reverted to approved",
      );
    }
  } catch (error) {
    log.error({ err: error, cardId }, "revertConfigToApproved failed");
  }
}
