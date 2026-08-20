import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { dbClient } from "@kan/db/client";
import * as listRepo from "@kan/db/repository/list.repo";
import * as projectBoardRepo from "@kan/db/repository/projectBoard.repo";
import * as projectCardRepo from "@kan/db/repository/projectCard.repo";
import * as projectLabelRepo from "@kan/db/repository/projectLabel.repo";
import * as projectPlanningRepo from "@kan/db/repository/projectPlanning.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { boards, labels, lists, projectCycles } from "@kan/db/schema";
import { generateSlug, generateUID } from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertPermission } from "../utils/permissions";

const roleSchema = z.enum(["editor", "viewer"]);
const cardStatusSchema = z.enum(["pending", "done", "missed"]);
const projectCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(10)
  .regex(/^[a-z0-9]+$/i, "Project code must contain only letters and numbers")
  .transform((value) => value.toUpperCase());

const deriveProjectCode = (name: string) => {
  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  const initials = normalizedName
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (initials || normalizedName.replace(/\s/g, "") || "PRJ").slice(0, 10);
};

const requireUser = (userId: string | undefined) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not authenticated",
    });
  }
  return userId;
};

const getProjectAccess = async (
  db: dbClient,
  userId: string,
  boardPublicId: string,
  requiredRole: "viewer" | "editor" = "viewer",
) => {
  const board = await projectBoardRepo.getWorkspaceBoardByPublicId(
    db,
    boardPublicId,
  );

  if (!board) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project board not found",
    });
  }

  const workspaceMember = await projectBoardRepo.getActiveWorkspaceMember(
    db,
    userId,
    board.workspaceId,
  );
  const user = await userRepo.getById(db, userId);
  const isWorkspaceAdmin = user?.role === "ADMIN";
  const membership = workspaceMember
    ? await projectBoardRepo.getMembership(db, board.id, workspaceMember.id)
    : undefined;

  if (!isWorkspaceAdmin && !membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this project board",
    });
  }

  if (
    requiredRole === "editor" &&
    !isWorkspaceAdmin &&
    membership?.role === "viewer"
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have edit access to this project board",
    });
  }

  return { board, workspaceMember, membership, isWorkspaceAdmin };
};

const getListContext = async (db: dbClient, listPublicId: string) => {
  const list = await db.query.lists.findFirst({
    columns: {
      id: true,
      publicId: true,
      boardId: true,
      name: true,
      index: true,
    },
    where: and(eq(lists.publicId, listPublicId), isNull(lists.deletedAt)),
  });
  if (!list) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project column not found",
    });
  }

  const board = await db.query.boards.findFirst({
    columns: {
      id: true,
      publicId: true,
      workspaceId: true,
      mode: true,
      isArchived: true,
    },
    where: and(
      eq(boards.id, list.boardId),
      eq(boards.mode, "project"),
      isNull(boards.deletedAt),
    ),
  });

  if (!board) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project board not found",
    });
  }

  return { list, board };
};

const getCardAccess = async (
  db: dbClient,
  userId: string,
  cardPublicId: string,
  requiredRole: "viewer" | "editor" = "viewer",
) => {
  const card = await projectCardRepo.getCardContext(db, cardPublicId);
  if (!card || card.list.board.mode !== "project") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project card not found",
    });
  }

  const access = await getProjectAccess(
    db,
    userId,
    card.list.board.publicId,
    requiredRole,
  );

  return { card, ...access };
};

const assertCycleDates = (startsAt?: Date | null, endsAt?: Date | null) => {
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cycle end date must be after its start date",
    });
  }
};

const getCycleBoardContext = async (db: dbClient, cyclePublicId: string) => {
  const [row] = await db
    .select({
      boardId: projectCycles.boardId,
      boardPublicId: boards.publicId,
      status: projectCycles.status,
    })
    .from(projectCycles)
    .innerJoin(boards, eq(projectCycles.boardId, boards.id))
    .where(
      and(
        eq(projectCycles.publicId, cyclePublicId),
        eq(boards.mode, "project"),
        isNull(boards.deletedAt),
      ),
    );
  return row;
};

export const projectBoardRouter = createTRPCRouter({
  all: protectedProcedure
    .meta({
      openapi: {
        summary: "List project boards",
        method: "GET",
        path: "/project-boards",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        archived: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });
      }

      const user = await userRepo.getById(ctx.db, userId);
      const member = await projectBoardRepo.getActiveWorkspaceMember(
        ctx.db,
        userId,
        workspace.id,
      );
      const accessibleBoardIds =
        user?.role === "ADMIN"
          ? undefined
          : member
            ? await projectBoardRepo.getAccessibleBoardIds(
                ctx.db,
                workspace.id,
                member.id,
              )
            : [];

      const boards = await projectBoardRepo.getAllAccessible(
        ctx.db,
        workspace.id,
        accessibleBoardIds,
      );

      return boards.filter(
        (board) => board.isArchived === (input.archived ?? false),
      );
    }),

  create: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a project board",
        method: "POST",
        path: "/project-boards",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        name: z.string().trim().min(1).max(255),
        projectCode: projectCodeSchema.optional(),
        description: z.string().max(10000).optional(),
        lists: z
          .array(z.string().trim().min(1).max(255))
          .max(30)
          .default(["Backlog", "In Progress", "Done"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "board:create");
      const member = await projectBoardRepo.getActiveWorkspaceMember(
        ctx.db,
        userId,
        workspace.id,
      );
      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Workspace membership is required",
        });
      }

      const slug = `${generateSlug(input.name)}-${generateUID()}`;
      return projectBoardRepo.create(ctx.db, {
        publicId: generateUID(),
        slug,
        name: input.name,
        projectCode: input.projectCode ?? deriveProjectCode(input.name),
        description: input.description,
        workspaceId: workspace.id,
        createdBy: userId,
        ownerUserId: userId,
        ownerWorkspaceMemberId: member.id,
        lists: input.lists,
      });
    }),

  byId: protectedProcedure
    .meta({
      openapi: {
        summary: "Get a project board",
        method: "GET",
        path: "/project-boards/{boardPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(z.object({ boardPublicId: z.string().min(12) }))
    .query(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const access = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
      );
      const board = await projectBoardRepo.getByPublicId(
        ctx.db,
        input.boardPublicId,
      );
      if (!board) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project board not found",
        });
      }
      return {
        ...board,
        permissions: {
          canEdit:
            access.isWorkspaceAdmin ||
            access.membership?.role === "owner" ||
            access.membership?.role === "editor",
        },
      };
    }),

  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a project board",
        method: "PUT",
        path: "/project-boards/{boardPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        name: z.string().trim().min(1).max(255).optional(),
        projectCode: projectCodeSchema.optional(),
        description: z.string().max(10000).nullable().optional(),
        isArchived: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      const [updated] = await ctx.db
        .update(boards)
        .set({
          name: input.name,
          projectCode: input.projectCode,
          description: input.description,
          isArchived: input.isArchived,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(boards.id, board.id),
            eq(boards.mode, "project"),
            isNull(boards.deletedAt),
          ),
        )
        .returning({ publicId: boards.publicId });
      return updated ?? { publicId: input.boardPublicId };
    }),

  getSettings: protectedProcedure
    .meta({
      openapi: {
        summary: "Get project board planning settings",
        method: "GET",
        path: "/project-boards/{boardPublicId}/settings",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(z.object({ boardPublicId: z.string().min(12) }))
    .query(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
      );
      return projectPlanningRepo.getSettings(ctx.db, board.id);
    }),

  scrumReport: protectedProcedure
    .meta({
      openapi: {
        summary: "Get Scrum burndown snapshot and velocity",
        method: "GET",
        path: "/project-boards/{boardPublicId}/scrum-report",
        tags: ["Project Reports"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        cyclePublicId: z.string().min(12).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
      );
      const settings = await projectPlanningRepo.getSettings(ctx.db, board.id);
      if (settings.workflowType !== "scrum") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Scrum reports are available only for Scrum boards",
        });
      }
      return projectPlanningRepo.getScrumReport(ctx.db, {
        boardId: board.id,
        cyclePublicId: input.cyclePublicId,
      });
    }),

  updateSettings: protectedProcedure
    .meta({
      openapi: {
        summary: "Update project board planning settings",
        method: "PUT",
        path: "/project-boards/{boardPublicId}/settings",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        workflowType: z.enum(["general", "scrum"]),
        estimationType: z.enum(["none", "story_points", "hours"]),
        enableCycles: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      if (
        input.workflowType === "general" &&
        input.estimationType === "story_points"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Story points are available only for Scrum workflow",
        });
      }
      if (input.workflowType === "scrum" && !input.enableCycles) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Scrum workflow requires cycles to be enabled",
        });
      }
      try {
        return await projectPlanningRepo.updateSettings(ctx.db, {
          boardId: board.id,
          workflowType: input.workflowType,
          estimationType: input.estimationType,
          enableCycles: input.enableCycles,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Invalid settings",
        });
      }
    }),

  createLabelField: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a custom project card label field",
        method: "POST",
        path: "/project-boards/{boardPublicId}/label-fields",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        name: z.string().trim().min(1).max(100),
        selectionMode: z.enum(["single", "multiple"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      try {
        return await projectLabelRepo.createField(ctx.db, {
          boardId: board.id,
          name: input.name,
          selectionMode: input.selectionMode,
          createdBy: userId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid label field",
        });
      }
    }),

  updateLabelField: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a custom project card label field",
        method: "PUT",
        path: "/project-boards/{boardPublicId}/label-fields/{fieldPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        fieldPublicId: z.string().min(12),
        name: z.string().trim().min(1).max(100).optional(),
        selectionMode: z.enum(["single", "multiple"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      try {
        return await projectLabelRepo.updateField(ctx.db, {
          boardId: board.id,
          fieldPublicId: input.fieldPublicId,
          name: input.name,
          selectionMode: input.selectionMode,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid label field",
        });
      }
    }),

  deleteLabelField: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a custom project card label field",
        method: "DELETE",
        path: "/project-boards/{boardPublicId}/label-fields/{fieldPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        fieldPublicId: z.string().min(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      try {
        return await projectLabelRepo.deleteField(ctx.db, {
          boardId: board.id,
          fieldPublicId: input.fieldPublicId,
          deletedBy: userId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid label field",
        });
      }
    }),

  createLabelOption: protectedProcedure
    .meta({
      openapi: {
        summary: "Create an option in a project card label field",
        method: "POST",
        path: "/project-boards/{boardPublicId}/label-fields/{fieldPublicId}/options",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        fieldPublicId: z.string().min(12),
        name: z.string().trim().min(1).max(255),
        colourCode: z.string().max(12).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      try {
        return await projectLabelRepo.createOption(ctx.db, {
          boardId: board.id,
          fieldPublicId: input.fieldPublicId,
          name: input.name,
          colourCode: input.colourCode,
          createdBy: userId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid label option",
        });
      }
    }),

  updateLabelOption: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a project card label option",
        method: "PUT",
        path: "/project-boards/{boardPublicId}/label-options/{optionPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        optionPublicId: z.string().min(12),
        name: z.string().trim().min(1).max(255).optional(),
        colourCode: z.string().max(12).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      try {
        return await projectLabelRepo.updateOption(ctx.db, {
          boardId: board.id,
          optionPublicId: input.optionPublicId,
          name: input.name,
          colourCode: input.colourCode,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid label option",
        });
      }
    }),

  deleteLabelOption: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a project card label option",
        method: "DELETE",
        path: "/project-boards/{boardPublicId}/label-options/{optionPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        optionPublicId: z.string().min(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      try {
        return await projectLabelRepo.deleteOption(ctx.db, {
          boardId: board.id,
          optionPublicId: input.optionPublicId,
          deletedBy: userId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid label option",
        });
      }
    }),

  createCycle: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a project cycle",
        method: "POST",
        path: "/project-boards/{boardPublicId}/cycles",
        tags: ["Project Cycles"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        name: z.string().trim().min(1).max(255),
        goal: z.string().trim().max(2000).optional(),
        startsAt: z.date().nullable().optional(),
        endsAt: z.date().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      const settings = await projectPlanningRepo.getSettings(ctx.db, board.id);
      if (!settings.enableCycles) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cycles are disabled for this project board",
        });
      }
      assertCycleDates(input.startsAt, input.endsAt);
      return projectPlanningRepo.createCycle(ctx.db, {
        boardId: board.id,
        name: input.name,
        goal: input.goal,
        startsAt: input.startsAt ?? undefined,
        endsAt: input.endsAt ?? undefined,
        createdBy: userId,
      });
    }),

  updateCycle: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a planned project cycle",
        method: "PUT",
        path: "/project-cycles/{cyclePublicId}",
        tags: ["Project Cycles"],
        protect: true,
      },
    })
    .input(
      z.object({
        cyclePublicId: z.string().min(12),
        name: z.string().trim().min(1).max(255).optional(),
        goal: z.string().trim().max(2000).nullable().optional(),
        startsAt: z.date().nullable().optional(),
        endsAt: z.date().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const cycle = await getCycleBoardContext(ctx.db, input.cyclePublicId);
      if (!cycle) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
      }
      await getProjectAccess(ctx.db, userId, cycle.boardPublicId, "editor");
      assertCycleDates(input.startsAt, input.endsAt);
      const updated = await projectPlanningRepo.updateCycle(ctx.db, {
        boardId: cycle.boardId,
        cyclePublicId: input.cyclePublicId,
        name: input.name,
        goal: input.goal,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      });
      if (!updated) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only planned cycles can be edited",
        });
      }
      return updated;
    }),

  startCycle: protectedProcedure
    .meta({
      openapi: {
        summary: "Start a project cycle",
        method: "POST",
        path: "/project-cycles/{cyclePublicId}/start",
        tags: ["Project Cycles"],
        protect: true,
      },
    })
    .input(z.object({ cyclePublicId: z.string().min(12) }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const cycle = await getCycleBoardContext(ctx.db, input.cyclePublicId);
      if (!cycle) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
      }
      await getProjectAccess(ctx.db, userId, cycle.boardPublicId, "editor");
      const started = await projectPlanningRepo.startCycle(ctx.db, {
        boardId: cycle.boardId,
        cyclePublicId: input.cyclePublicId,
      });
      if (!started) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only planned cycles can be started",
        });
      }
      return started;
    }),

  completeCycle: protectedProcedure
    .meta({
      openapi: {
        summary: "Complete a project cycle",
        method: "POST",
        path: "/project-cycles/{cyclePublicId}/complete",
        tags: ["Project Cycles"],
        protect: true,
      },
    })
    .input(z.object({ cyclePublicId: z.string().min(12) }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const cycle = await getCycleBoardContext(ctx.db, input.cyclePublicId);
      if (!cycle) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
      }
      await getProjectAccess(ctx.db, userId, cycle.boardPublicId, "editor");
      const completed = await projectPlanningRepo.completeCycle(ctx.db, {
        boardId: cycle.boardId,
        cyclePublicId: input.cyclePublicId,
      });
      if (!completed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only active cycles can be completed",
        });
      }
      return completed;
    }),

  setListCompletion: protectedProcedure
    .meta({
      openapi: {
        summary: "Set a project completion column",
        method: "PUT",
        path: "/project-columns/{listPublicId}/completion",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        listPublicId: z.string().min(12),
        isCompletionColumn: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { list, board } = await getListContext(ctx.db, input.listPublicId);
      await getProjectAccess(ctx.db, userId, board.publicId, "editor");
      return projectPlanningRepo.setListCompletion(ctx.db, {
        boardId: board.id,
        listId: list.id,
        isCompletionColumn: input.isCompletionColumn,
      });
    }),

  addMember: protectedProcedure
    .meta({
      openapi: {
        summary: "Add a project board member",
        method: "POST",
        path: "/project-boards/{boardPublicId}/members",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        workspaceMemberPublicId: z.string().min(12),
        role: roleSchema.default("editor"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      const member = await projectBoardRepo.getWorkspaceMemberByPublicId(
        ctx.db,
        input.workspaceMemberPublicId,
      );
      if (
        !member ||
        member.workspaceId !== board.workspaceId ||
        member.status !== "active"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Member must belong to this workspace",
        });
      }
      const existingMembership = await projectBoardRepo.getMembership(
        ctx.db,
        board.id,
        member.id,
      );
      if (existingMembership?.role === "owner") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The project board owner cannot be downgraded.",
        });
      }
      return projectBoardRepo.addMember(ctx.db, {
        boardId: board.id,
        workspaceMemberId: member.id,
        role: input.role,
      });
    }),

  removeMember: protectedProcedure
    .meta({
      openapi: {
        summary: "Remove a project board member",
        method: "DELETE",
        path: "/project-boards/{boardPublicId}/members/{workspaceMemberPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        workspaceMemberPublicId: z.string().min(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      const member = await projectBoardRepo.getWorkspaceMemberByPublicId(
        ctx.db,
        input.workspaceMemberPublicId,
      );
      if (!member || member.workspaceId !== board.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Board member not found",
        });
      }
      const membership = await projectBoardRepo.getMembership(
        ctx.db,
        board.id,
        member.id,
      );
      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Board member not found",
        });
      }
      if (membership.role === "owner") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The project board owner cannot be removed.",
        });
      }
      return projectBoardRepo.removeMember(ctx.db, {
        boardId: board.id,
        workspaceMemberId: member.id,
        deletedBy: userId,
      });
    }),

  createList: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a project board column",
        method: "POST",
        path: "/project-boards/{boardPublicId}/columns",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        name: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getProjectAccess(
        ctx.db,
        userId,
        input.boardPublicId,
        "editor",
      );
      const list = await listRepo.create(ctx.db, {
        name: input.name,
        createdBy: userId,
        boardId: board.id,
      });
      return { publicId: list.publicId, name: list.name };
    }),

  updateList: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a project board column",
        method: "PUT",
        path: "/project-columns/{listPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        listPublicId: z.string().min(12),
        name: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getListContext(ctx.db, input.listPublicId);
      await getProjectAccess(ctx.db, userId, board.publicId, "editor");
      return listRepo.update(
        ctx.db,
        { name: input.name },
        { listPublicId: input.listPublicId },
      );
    }),

  reorderList: protectedProcedure
    .meta({
      openapi: {
        summary: "Reorder a project board column",
        method: "PUT",
        path: "/project-columns/{listPublicId}/position",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        listPublicId: z.string().min(12),
        index: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { board } = await getListContext(ctx.db, input.listPublicId);
      await getProjectAccess(ctx.db, userId, board.publicId, "editor");
      return listRepo.reorder(ctx.db, {
        listPublicId: input.listPublicId,
        newIndex: input.index,
      });
    }),

  deleteList: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a project board column",
        method: "DELETE",
        path: "/project-columns/{listPublicId}",
        tags: ["Project Boards"],
        protect: true,
      },
    })
    .input(z.object({ listPublicId: z.string().min(12) }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { list, board } = await getListContext(ctx.db, input.listPublicId);
      await getProjectAccess(ctx.db, userId, board.publicId, "editor");
      await listRepo.softDeleteById(ctx.db, {
        listId: list.id,
        deletedAt: new Date(),
        deletedBy: userId,
      });
      return { success: true };
    }),

  createCard: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a project card",
        method: "POST",
        path: "/project-cards",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        listPublicId: z.string().min(12),
        parentCardPublicId: z.string().min(12).nullable().optional(),
        title: z.string().trim().min(1).max(2000),
        description: z.string().max(10000).optional(),
        memberPublicIds: z.array(z.string().min(12)).max(100),
        position: z.enum(["start", "end"]).default("end"),
        dueDate: z.date().nullable().optional(),
        startDate: z.date().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { list, board } = await getListContext(ctx.db, input.listPublicId);
      await getProjectAccess(ctx.db, userId, board.publicId, "editor");

      const members = await workspaceRepo.getAllMembersByPublicIds(
        ctx.db,
        input.memberPublicIds,
      );
      const parent = input.parentCardPublicId
        ? await projectCardRepo.getCardContext(ctx.db, input.parentCardPublicId)
        : null;
      if (
        input.parentCardPublicId &&
        (!parent || parent.list.board.id !== board.id)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Parent card must belong to this board",
        });
      }

      const completionListId = await projectPlanningRepo.getCompletionListId(
        ctx.db,
        board.id,
      );

      return projectCardRepo.create(ctx.db, {
        title: input.title,
        description: input.description,
        listId: list.id,
        createdBy: userId,
        position: input.position,
        parentCardId: parent?.id ?? null,
        dueDate: input.dueDate,
        startDate: input.startDate,
        status: list.id === completionListId ? "done" : undefined,
        workspaceMemberIds: members.map((member) => member.id),
      });
    }),

  setCardPlanning: protectedProcedure
    .meta({
      openapi: {
        summary: "Assign a project card to a cycle and set its estimate",
        method: "PUT",
        path: "/project-cards/{cardPublicId}/planning",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        cyclePublicId: z.string().min(12).nullable(),
        estimateValue: z.number().finite().nonnegative().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { card, board } = await getCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "editor",
      );
      const settings = await projectPlanningRepo.getSettings(ctx.db, board.id);
      if (settings.estimationType === "none" && input.estimateValue != null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Estimation is disabled for this project board",
        });
      }
      if (
        settings.estimationType === "story_points" &&
        input.estimateValue != null &&
        !Number.isInteger(input.estimateValue)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Story point estimates must be whole numbers",
        });
      }
      if (
        settings.estimationType === "hours" &&
        input.estimateValue != null &&
        input.estimateValue <= 0
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Hour estimates must be greater than zero",
        });
      }
      const cyclePublicId = input.cyclePublicId;
      let cycleId: number | null = null;
      if (cyclePublicId != null) {
        if (!settings.enableCycles) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cycles are disabled for this project board",
          });
        }
        const cycle = await projectPlanningRepo.getCycleContext(
          ctx.db,
          board.id,
          cyclePublicId,
        );
        if (!cycle || cycle.status === "completed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Card can only be assigned to a planned or active cycle",
          });
        }
        cycleId = cycle.id;
      }

      return projectPlanningRepo.setCardPlanning(ctx.db, {
        cardId: card.id,
        cycleId,
        estimateValue: input.estimateValue,
      });
    }),

  getCard: protectedProcedure
    .meta({
      openapi: {
        summary: "Get a project card",
        method: "GET",
        path: "/project-cards/{cardPublicId}",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .query(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      await getCardAccess(ctx.db, userId, input.cardPublicId);
      const card = await projectCardRepo.getByPublicId(
        ctx.db,
        input.cardPublicId,
      );
      if (!card)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project card not found",
        });
      return card;
    }),

  updateCard: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a project card",
        method: "PUT",
        path: "/project-cards/{cardPublicId}",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        title: z.string().trim().min(1).max(2000).optional(),
        description: z.string().max(10000).optional(),
        parentCardPublicId: z.string().min(12).nullable().optional(),
        dueDate: z.date().nullable().optional(),
        startDate: z.date().nullable().optional(),
        status: cardStatusSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { card } = await getCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "editor",
      );
      let parentCardId: number | null | undefined;
      if (input.parentCardPublicId !== undefined) {
        const parent = input.parentCardPublicId
          ? await projectCardRepo.getCardContext(
              ctx.db,
              input.parentCardPublicId,
            )
          : null;
        if (
          input.parentCardPublicId &&
          (!parent || parent.list.board.id !== card.list.board.id)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Parent card must belong to this board",
          });
        }
        parentCardId = parent?.id ?? null;
      }

      const completionListId =
        input.status === "done"
          ? await projectPlanningRepo.getCompletionListId(
              ctx.db,
              card.list.board.id,
            )
          : null;
      const shouldMoveToCompletion =
        completionListId !== null && card.list.id !== completionListId;

      const updatedCard = await projectCardRepo.update(ctx.db, {
        cardId: card.id,
        boardId: card.list.board.id,
        title: input.title,
        description: input.description,
        parentCardId,
        dueDate: input.dueDate,
        startDate: input.startDate,
        status: input.status,
      });
      if (shouldMoveToCompletion) {
        await projectCardRepo.reorder(ctx.db, {
          cardId: card.id,
          newListId: completionListId,
          status: "done",
        });
      }
      return updatedCard;
    }),

  moveCard: protectedProcedure
    .meta({
      openapi: {
        summary: "Move a project card",
        method: "PUT",
        path: "/project-cards/{cardPublicId}/position",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        listPublicId: z.string().min(12),
        index: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { card, board } = await getCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "editor",
      );
      const destination = await listRepo.getByPublicId(
        ctx.db,
        input.listPublicId,
      );
      if (!destination || destination.boardId !== board.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Destination column must belong to this board",
        });
      }
      const completionListId = await projectPlanningRepo.getCompletionListId(
        ctx.db,
        board.id,
      );
      const status =
        destination.id === completionListId
          ? "done"
          : card.list.id === completionListId
            ? "pending"
            : undefined;
      return projectCardRepo.reorder(ctx.db, {
        cardId: card.id,
        newListId: destination.id,
        newIndex: input.index,
        status,
      });
    }),

  deleteCard: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a project card",
        method: "DELETE",
        path: "/project-cards/{cardPublicId}",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { card } = await getCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "editor",
      );
      return projectCardRepo.softDelete(ctx.db, {
        cardId: card.id,
        deletedBy: userId,
      });
    }),

  setCardMembers: protectedProcedure
    .meta({
      openapi: {
        summary: "Set project card members",
        method: "PUT",
        path: "/project-cards/{cardPublicId}/members",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        memberPublicIds: z.array(z.string().min(12)).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { card } = await getCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "editor",
      );
      const members = await workspaceRepo.getAllMembersByPublicIds(
        ctx.db,
        input.memberPublicIds,
      );
      return projectCardRepo.setMembers(ctx.db, {
        cardId: card.id,
        boardId: card.list.board.id,
        workspaceMemberIds: members.map((member) => member.id),
      });
    }),

  toggleCardLabel: protectedProcedure
    .meta({
      openapi: {
        summary: "Toggle a label on a project card",
        method: "PUT",
        path: "/project-cards/{cardPublicId}/labels/{labelPublicId}",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        labelPublicId: z.string().min(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { card } = await getCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "editor",
      );
      const label = await ctx.db.query.labels.findFirst({
        columns: { id: true, projectLabelFieldId: true },
        where: and(
          eq(labels.publicId, input.labelPublicId),
          eq(labels.boardId, card.list.board.id),
          isNull(labels.deletedAt),
        ),
      });
      if (!label) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Label must belong to this project board",
        });
      }
      if (label.projectLabelFieldId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use the label field endpoint for custom project labels",
        });
      }
      return projectCardRepo.toggleLabel(ctx.db, {
        cardId: card.id,
        boardId: card.list.board.id,
        labelId: label.id,
        userId,
      });
    }),

  setCardLabelOptions: protectedProcedure
    .meta({
      openapi: {
        summary: "Set the selected options for a project card label field",
        method: "PUT",
        path: "/project-cards/{cardPublicId}/label-fields/{fieldPublicId}",
        tags: ["Project Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        fieldPublicId: z.string().min(12),
        optionPublicIds: z.array(z.string().min(12)).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.user?.id);
      const { card } = await getCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "editor",
      );
      try {
        return await projectLabelRepo.setCardOptions(ctx.db, {
          cardId: card.id,
          boardId: card.list.board.id,
          fieldPublicId: input.fieldPublicId,
          optionPublicIds: input.optionPublicIds,
          userId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid label options",
        });
      }
    }),
});
