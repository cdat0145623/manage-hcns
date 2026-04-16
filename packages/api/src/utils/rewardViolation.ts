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

interface ViolationCandidate {
  violationType: RewardViolationType;
  beforeValue: unknown;
  afterValue: unknown;
}

/**
 * Detects reward violations by comparing new card values against the snapshot
 * taken at approval time, then atomically downgrades the config to DRAFT.
 *
 * Concurrency model (no SELECT FOR UPDATE, no dedup query needed):
 *
 *   1. Compare new values vs snapshot → collect violation candidates
 *   2. Attempt atomic downgrade:
 *        UPDATE … WHERE approvalStatus = 'approved' RETURNING id
 *   3. If RETURNING returns a row → we won the race → insert all logs
 *      If RETURNING returns nothing → another request already downgraded → skip
 *
 * Only the first concurrent request can succeed the downgrade; all subsequent
 * requests find status ≠ 'approved' and exit cleanly at step 1 or step 2.
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
  /** Pass when dueDate was changed in this request. */
  newDueDate?: Date | null;
  /** Pass when startDate was changed in this request. */
  newStartDate?: Date | null;
  /** Pass when a workspace member was added or removed. */
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
      // ── Step 1: Find the APPROVED config + snapshot ───────────────────────
      const config = await tx.query.cardRewardConfigs.findFirst({
        where: (t, { and, eq }) =>
          and(
            eq(t.cardId, cardId),
            eq(t.approvalStatus, "approved"),
          ),
      });

      if (!config) return; // No APPROVED config → nothing to do

      const snapshot = await tx.query.cardRewardSnapshots.findFirst({
        where: eq(cardRewardSnapshots.configId, config.id),
      });

      // ── Step 2: Compare new values vs snapshot ────────────────────────────
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
          // Equal to snapshot → user restored the approved date, no violation
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

      if (candidates.length === 0) return; // Changes match snapshot → no violation

      // ── Step 3: Atomic downgrade ──────────────────────────────────────────
      // This UPDATE is the concurrency gate.
      // Exactly one concurrent request will get a row back; the rest get 0 rows.
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
        // Another concurrent request already won — skip silently
        log.debug(
          { configId: config.id, cardId },
          "Reward violation: concurrency skip — config already downgraded",
        );
        return;
      }

      // ── Step 4: We won — bulk-insert all violation logs ───────────────────
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
        {
          configId: config.id,
          cardId,
          violations: candidates.map((c) => c.violationType),
        },
        "Reward violations recorded — config auto-downgraded to draft",
      );
    });
  } catch (error) {
    log.error({ err: error, cardId }, "trackCardRewardViolations failed");
  }
}
