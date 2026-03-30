import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import {protectedProcedure, createTRPCRouter} from "../trpc";
import {z} from "zod";
import {statusTypeEnum} from "@kan/db/schema";

const statusTypeEnumSchema = z.enum(statusTypeEnum.enumValues);

export const taskInstanceRouter = createTRPCRouter({
    create: protectedProcedure
    .meta({
        openapi: {
            summary: "Create a task instance",
            method: "POST",
            path: "/task-instance",
            description: "Create a task instance",
            tags: ["taskInstance"],
            protect: true,
        }
    })
    .input(
        z.object({
            userId: z.string(),
            taskMasterId: z.string(),
            targetDate: z.date(),
            actualDate: z.date(),
            status: statusTypeEnumSchema,
        })
    )
    .mutation(async ({ctx, input}) => {
        const {userId, taskMasterId, targetDate, actualDate, status} = input;

        return taskInstanceRepo.create(ctx.db, {
            userId,
            taskMasterId,
            targetDate,
            actualDate,
            status,
        });
    }),
    getVirtual: protectedProcedure
    .meta({
        openapi: {
        summary: "Get virtual task instances",
        method: "GET",
        path: "/task-instance-virtual",
        tags: ["taskInstance"],
        protect: true,
        },
    })
    .input(
        z.object({
        taskMasterId: z.string(),
        from: z.coerce.date(),
        to: z.coerce.date(),
        })
    )
    .output(z.custom<Awaited<ReturnType<typeof taskInstanceRepo.generateVirtualTaskInstances>>>())
    .query(async ({ ctx, input }) => {
        console.log("input",input)
        const taskMaster = await ctx.db.query.taskMasters.findFirst({
            where: (t, { eq }) => eq(t.id, input.taskMasterId),
            with: { frequence: true },
        });

        if (!taskMaster?.frequence) {
            throw new Error("TaskMaster not found");
        }

        if (!taskMaster.frequence.rruleString || !taskMaster.frequence.dtStart) {
            throw new Error("Frequence not found");
        }

        return taskInstanceRepo.generateVirtualTaskInstances({
            userId: taskMaster.targetUser,
            taskMasterId: taskMaster.id,
            rruleString: taskMaster.frequence.rruleString,
            startDate: taskMaster.startDate,
            from: input.from,
            to: input.to,
        });
    }),
})