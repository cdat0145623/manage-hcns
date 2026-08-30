/**
 * Compatibility boundary for reconciliation code. The implementation remains
 * in taskPenaltyPolicy.repo.ts while callers migrate without changing runtime
 * behavior or transaction ownership.
 */
import { reconcilePendingPenaltySnapshotsInternal } from "./taskPenaltyPolicy.repo";

export const reconcilePendingPenaltySnapshots = reconcilePendingPenaltySnapshotsInternal;
