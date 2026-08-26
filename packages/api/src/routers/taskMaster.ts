import { TRPCError } from "@trpc/server";
import { and, eq, ilike } from "drizzle-orm";
import { RRule } from "rrule";
import { z } from "zod";

import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import { TASK_PENALTY_PRIORITIES } from "@kan/db/repository/taskPenaltyPolicy.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import { taskMasters } from "@kan/db/schema";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const amountVndSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const createPenaltyPolicySchema = z
  .union([
    z.object({ priority: z.null() }),
    z.object({
      priority: z.enum(TASK_PENALTY_PRIORITIES),
      amountMode: z.literal("default"),
    }),
    z.object({
      priority: z.enum(TASK_PENALTY_PRIORITIES),
      amountMode: z.literal("override"),
      overrideAmountVnd: amountVndSchema,
    }),
  ])
  .optional();

const updatePenaltyPolicySchema = z
  .object({
    policy: createPenaltyPolicySchema.unwrap(),
    priorityChangeAction: z
      .enum(["keep_override", "use_new_default"])
      .optional(),
  })
  .optional();

const assertSystemAdmin = async (ctx: {
  db: Parameters<typeof userRepo.getById>[0];
  user: { id: string } | null | undefined;
}) => {
  const userId = ctx.user?.id;
  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const user = await userRepo.getById(ctx.db, userId);
  if (user?.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return userId;
};

const WEEKDAY_LABELS: Record<string, string> = {
  MO: "Thứ Hai",
  TU: "Thứ Ba",
  WE: "Thứ Tư",
  TH: "Thứ Năm",
  FR: "Thứ Sáu",
  SA: "Thứ Bảy",
  SU: "Chủ Nhật",
};

const formatRecurrenceText = (rruleString: string | null, start: Date) => {
  if (!rruleString) return "Không lặp";
  try {
    const rule = RRule.fromString(rruleString.replace(/\\n/g, "\n"));
    const options = rule.options;
    const time = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    if (options.freq === RRule.DAILY) return `Mỗi ngày · ${time}`;
    if (options.freq === RRule.WEEKLY) {
      const weekdays = (options.byweekday ?? [])
        .map((day) => {
          const weekday = day as number;
          const key = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"][weekday];
          return key ? WEEKDAY_LABELS[key] : "";
        })
        .filter(Boolean);
      return `${weekdays.length ? weekdays.join(", ") : "Hàng tuần"} · ${time}`;
    }
    if (options.freq === RRule.MONTHLY) return `Mỗi tháng · ${time}`;
    return `Lặp lại · ${time}`;
  } catch {
    return "Lặp lại";
  }
};

export const taskMasterRouter = createTRPCRouter({
  listAdmin: protectedProcedure
    .meta({
      openapi: {
        summary: "List recurring task masters for administrators",
        method: "GET",
        path: "/task-master/admin",
        tags: ["taskMaster"],
        protect: true,
      },
    })
    .input(
      z.object({
        search: z.string().trim().max(255).optional(),
        priority: z.enum(TASK_PENALTY_PRIORITIES).optional(),
        selectedUserId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertSystemAdmin(ctx);
      const masters = await ctx.db.query.taskMasters.findMany({
        where: and(
          eq(taskMasters.isDeleted, false),
          ...(input.search
            ? [ilike(taskMasters.name, `%${input.search}%`)]
            : []),
          ...(input.priority ? [eq(taskMasters.priority, input.priority)] : []),
          ...(input.selectedUserId
            ? [eq(taskMasters.targetUser, input.selectedUserId)]
            : []),
        ),
        with: { frequence: true, assignee: true },
      });

      return masters.flatMap((master) =>
        master.publicId
          ? [
              {
                publicId: master.publicId,
                name: master.name,
                description: master.description,
                startDate: master.startDate,
                endDate: master.endDate,
                priority: master.priority,
                overrideAmountVnd: master.penaltyOverrideAmountVnd,
                rruleString: master.frequence.rruleString,
                recurrenceText: formatRecurrenceText(
                  master.frequence.rruleString,
                  master.startDate,
                ),
                assignee: {
                  id: master.assignee.id,
                  name: master.assignee.name,
                  email: master.assignee.email,
                },
              },
            ]
          : [],
      );
    }),
  updateAdmin: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a recurring task master by public ID",
        method: "PUT",
        path: "/task-master/admin/{publicId}",
        tags: ["taskMaster"],
        protect: true,
      },
    })
    .input(
      z.object({
        publicId: z.string().length(12),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        selectedUserId: z.string().uuid().optional(),
        rruleString: z.string().optional(),
        penaltyPolicy: updatePenaltyPolicySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = await assertSystemAdmin(ctx);
      const master = await ctx.db.query.taskMasters.findFirst({
        where: eq(taskMasters.publicId, input.publicId),
        columns: { id: true },
      });
      if (!master) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task master not found",
        });
      }
      const updated = await taskMasterRepo.update(ctx.db, {
        id: master.id,
        userId,
        name: input.name,
        description: input.description,
        startDate: input.startDate,
        endDate: input.endDate,
        selectedUserId: input.selectedUserId,
        rruleString: input.rruleString,
        penaltyPolicy: input.penaltyPolicy,
      });
      return { publicId: updated.publicId };
    }),
  create: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a task master",
        method: "POST",
        path: "/task-master",
        description: "Create a task master",
        tags: ["taskMaster"],
        protect: true,
      },
    })
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        selectedUserId: z.string(),
        rruleString: z.string(),
        from: z.coerce.date(),
        to: z.coerce.date(),
        penaltyPolicy: createPenaltyPolicySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = await assertSystemAdmin(ctx);

      const {
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
        from,
        to,
        penaltyPolicy,
      } = input;

      const taskMaster = await taskMasterRepo.create(ctx.db, {
        userId: userId,
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
        penaltyPolicy,
      });

      const virtualTaskInstances =
        await taskInstanceRepo.generateVirtualTaskInstances({
          userId: userId,
          taskMasterId: taskMaster.id,
          rruleString,
          startDate,
          masterEndDate: taskMaster.endDate,
          from,
          to,
        });

      const newVirtualTaskInstances = virtualTaskInstances.map(
        (taskInstance) => {
          return {
            ...taskInstance,
            selectedUserId: taskMaster.targetUser,
            startDate: taskMaster.startDate,
          };
        },
      );

      return newVirtualTaskInstances;
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a task master",
        method: "PUT",
        path: "/task-master",
        description: "Update a task master",
        tags: ["taskMaster"],
        protect: true,
      },
    })
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        selectedUserId: z.string().optional(),
        rruleString: z.string().optional(),
        penaltyPolicy: updatePenaltyPolicySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = await assertSystemAdmin(ctx);

      const {
        id,
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
        penaltyPolicy,
      } = input;

      // Only persist template changes on taskMasters. Existing taskInstances keep
      // their snapshot (dates, title, assignee on the row) until edited via taskInstance.update.
      try {
        return await taskMasterRepo.update(ctx.db, {
          id,
          name,
          description,
          startDate,
          endDate,
          selectedUserId,
          rruleString,
          penaltyPolicy: penaltyPolicy ? penaltyPolicy : undefined,
          userId,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("priorityChangeAction is required")
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
});
