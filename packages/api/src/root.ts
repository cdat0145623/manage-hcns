import { attachmentRouter } from "./routers/attachment";
import { boardRouter } from "./routers/board";
import { cardRouter } from "./routers/card";
import { checklistRouter } from "./routers/checklist";
import { feedbackRouter } from "./routers/feedback";
import { healthRouter } from "./routers/health";
import { importRouter } from "./routers/import";
import { integrationRouter } from "./routers/integration";
import { labelRouter } from "./routers/label";
import { listRouter } from "./routers/list";
import { memberRouter } from "./routers/member";
import { permissionRouter } from "./routers/permission";
import { taskMasterRouter } from "./routers/taskMaster";
import { userRouter } from "./routers/user";
import { webhookRouter } from "./routers/webhook";
import { workspaceRouter } from "./routers/workspace";
import { createTRPCRouter } from "./trpc";
import { taskInstanceRouter } from "./routers/taskInstance";
import { taskMasterRouter } from "./routers/taskMaster";

export const appRouter = createTRPCRouter({
  attachment: attachmentRouter,
  board: boardRouter,
  card: cardRouter,
  checklist: checklistRouter,
  feedback: feedbackRouter,
  health: healthRouter,
  label: labelRouter,
  list: listRouter,
  member: memberRouter,
  import: importRouter,
  permission: permissionRouter,
  user: userRouter,
  webhook: webhookRouter,
  workspace: workspaceRouter,
  integration: integrationRouter,
  taskMaster: taskMasterRouter,
<<<<<<< HEAD
=======
  taskInstance: taskInstanceRouter,
>>>>>>> a77a786762bff73596f8050616a964aafd435c07
});

export type AppRouter = typeof appRouter;
