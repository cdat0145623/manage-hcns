import { eq, sql } from "drizzle-orm";

import { createLogger } from "@kan/logger";
import type { dbClient } from "@kan/db/client";
import {
  cardRewardConfigs,
  cardRewardLogs,
  cardRewardSnapshots,
} from "@kan/db/schema";

const log = createLogger("reward-violation");

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
        if (!snappedStart || newStartDate.getTime() !== snappedStart.getTime()) {
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

      // Step 4: Won the race — bulk-insert all violation logs
      await tx.insert(cardRewardLogs).values(
        candidates.map((c) => ({
          configId: config.id,
          violationType: c.violationType,
          beforeValue: c.beforeValue as Record<string, unknown>,
          afterValue: c.afterValue as Record<string, unknown>,
          detectedAt: new Date(),
        })),
      );

      log.info(
        { configId: config.id, cardId, violations: candidates.map((c) => c.violationType) },
        "Reward violations recorded — config auto-downgraded to draft",
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

        // Always insert the audit log regardless of whether downgrade occurred.
        await tx.insert(cardRewardLogs).values({
          configId,
          violationType,
          beforeValue: beforeValue as Record<string, unknown>,
          afterValue: afterValue as Record<string, unknown>,
          detectedAt: new Date(),
        });

        if (downgraded.length) {
          log.info(
            { configId, violationType },
            "Config violation recorded — config auto-downgraded to draft",
          );
        } else {
          log.debug(
            { configId, violationType },
            "Config audit log inserted (no downgrade needed)",
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

