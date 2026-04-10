import type { api } from "~/utils/api";

/**
 * Invalidates all card-related queries for a given card.
 * Use this after any mutation that affects card data or activities.
 */
export async function invalidateCard(
  utils: ReturnType<typeof api.useUtils>,
  cardPublicId: string,
) {
  if (!cardPublicId || cardPublicId.length < 12) return;
  
  await Promise.all([
    utils.card.byId.invalidate({ cardPublicId }),
    utils.card.getActivities.invalidate({ cardPublicId }),
  ]);
}

/**
 * Invalidates all task-instance-related queries.
 */
export async function invalidateTaskInstance(
  utils: ReturnType<typeof api.useUtils>,
  taskInstanceId: string,
) {
  if (!taskInstanceId) return;

  await Promise.all([
    utils.taskInstance.getActivities.invalidate({ id: taskInstanceId }),
    utils.attachment.getByTaskInstanceId.invalidate({ taskInstanceId }),
    utils.taskInstance.byId.invalidate({ id: taskInstanceId }),
    utils.taskInstance.getVirtual.invalidate(),
  ]);
}

