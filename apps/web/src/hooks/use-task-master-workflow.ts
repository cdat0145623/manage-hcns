import { useCallback } from "react";
import type { RouterInputs } from "~/utils/api";

interface WorkflowActions {
  create: (input: RouterInputs["taskMaster"]["create"]) => void;
  update: (input: RouterInputs["taskMaster"]["update"]) => void;
  updateAdmin: (input: RouterInputs["taskMaster"]["updateAdmin"]) => void;
}

export function useTaskMasterWorkflow(actions: WorkflowActions) {
  const { create: createAction, update: updateAction, updateAdmin: updateAdminAction } = actions;
  const create = useCallback((input: RouterInputs["taskMaster"]["create"]) => createAction(input), [createAction]);
  const update = useCallback((input: RouterInputs["taskMaster"]["update"]) => updateAction(input), [updateAction]);
  const updateAdmin = useCallback((input: RouterInputs["taskMaster"]["updateAdmin"]) => updateAdminAction(input), [updateAdminAction]);
  return { create, update, updateAdmin };
}
