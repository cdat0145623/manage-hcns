import { attachmentRouter } from "./routers/attachment";
import { boardRouter } from "./routers/board";
import { cardRouter } from "./routers/card";
import { checklistRouter } from "./routers/checklist";
import { cronRouter } from "./routers/cron";
import { dashboardRouter } from "./routers/dashboard";
import { feedbackRouter } from "./routers/feedback";
import { healthRouter } from "./routers/health";
import { importRouter } from "./routers/import";
import { integrationRouter } from "./routers/integration";
import { labelRouter } from "./routers/label";
import { listRouter } from "./routers/list";
import { memberRouter } from "./routers/member";
import { permissionRouter } from "./routers/permission";
import { positionRouter } from "./routers/position";
import { taskInstanceRouter } from "./routers/taskInstance";
import { taskMasterRouter } from "./routers/taskMaster";
import { userRouter } from "./routers/user";
import { webhookRouter } from "./routers/webhook";
import { workspaceRouter } from "./routers/workspace";
import { rewardConfigRouter } from "./routers/reward";
import { rewardPublicRouter } from "./routers/rewardPublic";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  attachment: attachmentRouter,
  board: boardRouter,
  card: cardRouter,
  checklist: checklistRouter,
  cron: cronRouter,
  dashboard: dashboardRouter,
  feedback: feedbackRouter,
  health: healthRouter,
  label: labelRouter,
  list: listRouter,
  member: memberRouter,
  import: importRouter,
  permission: permissionRouter,
  position: positionRouter,
  user: userRouter,
  webhook: webhookRouter,
  workspace: workspaceRouter,
  integration: integrationRouter,
  taskMaster: taskMasterRouter,
  taskInstance: taskInstanceRouter,
  reward: rewardConfigRouter,
  rewardPublic: rewardPublicRouter,
});

export type AppRouter = typeof appRouter;
