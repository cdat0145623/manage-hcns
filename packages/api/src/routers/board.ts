/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as boardRepo from "@kan/db/repository/board.repo";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as activityRepo from "@kan/db/repository/cardActivity.repo";
import * as labelRepo from "@kan/db/repository/label.repo";
import * as listRepo from "@kan/db/repository/list.repo";
import * as permissionRepo from "@kan/db/repository/permission.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { colours } from "@kan/shared/constants";
import {
  convertDueDateFiltersToRanges,
  generateAvatarUrl,
  generateSlug,
  generateUID,
} from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import {
  assertCanDelete,
  assertCanEdit,
  assertPermission,
} from "../utils/permissions";

export const boardRouter = createTRPCRouter({
  all: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/workspaces/{workspacePublicId}/boards",
        summary: "Get all boards",
        description: "Retrieves all boards for a given workspace",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        type: z.enum(["regular", "template"]).optional(),
        archived: z.boolean().optional(),
      }),
    )
    .output(
      z.custom<Awaited<ReturnType<typeof boardRepo.getAllByWorkspaceId>>>(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const user = await userRepo.getById(ctx.db, userId);

      if (!user)
        throw new TRPCError({
          message: `User with ID ${userId} not found`,
          code: "NOT_FOUND",
        });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with public ID ${input.workspacePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, workspace.id, "board:view");

      const result = await boardRepo.getAllByWorkspaceId(
        ctx.db,
        workspace.id,
        userId,
        user.role,
        {
          type: input.type,
          archived: input.archived ?? false,
        },
      );

      return result;
    }),
  allByUserId: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/{userId}/boards",
        summary: "Get all boards for a user",
        description: "Retrieves all boards for a given user",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        userId: z.string().min(12),
        workspacePublicId: z.string().min(12),
        archived: z.boolean().optional(),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof boardRepo.getAllByUserId>>>())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const user = await userRepo.getById(ctx.db, input.userId);

      if (!user)
        throw new TRPCError({
          message: `User with ID ${input.userId} not found`,
          code: "NOT_FOUND",
        });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with public ID ${input.workspacePublicId} not found`,
          code: "NOT_FOUND",
        });

      const result = await boardRepo.getAllByUserId(
        ctx.db,
        input.userId,
        workspace.id,
        {
          archived: input.archived ?? false,
        },
      );

      return result;
    }),
  byId: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/boards/{boardPublicId}",
        summary: "Get board by public ID",
        description: "Retrieves a board by its public ID",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        members: z.array(z.string().min(12)).optional(),
        labels: z.array(z.string().min(12)).optional(),
        lists: z.array(z.string().min(12)).optional(),
        dueDateFilters: z
          .array(
            z.enum([
              "overdue",
              "today",
              "tomorrow",
              "next-week",
              "next-month",
              "no-due-date",
            ]),
          )
          .optional(),
        type: z.enum(["regular", "template"]).optional(),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof boardRepo.getByPublicId>>>())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
        ctx.db,
        input.boardPublicId,
      );

      if (!board)
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, board.workspaceId, "board:view");

      // Convert semantic string filters to date ranges expected by the repo
      const dueDateFilters = input.dueDateFilters
        ? convertDueDateFiltersToRanges(input.dueDateFilters)
        : [];

      const result = await boardRepo.getByPublicId(
        ctx.db,
        input.boardPublicId,
        userId,
        {
          members: input.members ?? [],
          labels: input.labels ?? [],
          lists: input.lists ?? [],
          dueDate: dueDateFilters,
          type: input.type,
        },
      );

      if (!result) {
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });
      }

      // Generate presigned URLs for workspace member avatars
      const workspaceWithAvatarUrls = result.workspace
        ? {
            ...result.workspace,
            members: await Promise.all(
              result.workspace.members.map(async (member) => {
                if (!member.user?.image) {
                  return member;
                }

                const avatarUrl = await generateAvatarUrl(member.user.image);
                return {
                  ...member,
                  user: {
                    ...member.user,
                    image: avatarUrl,
                  },
                };
              }),
            ),
          }
        : result.workspace;

      // Generate presigned URLs for card member avatars
      const listsWithAvatarUrls = await Promise.all(
        result.lists.map(async (list) => ({
          ...list,
          cards: await Promise.all(
            list.cards.map(async (card) => ({
              ...card,
              members: await Promise.all(
                card.members.map(async (member) => {
                  if (!member.user?.image) return member;
                  const avatarUrl = await generateAvatarUrl(member.user.image);
                  return {
                    ...member,
                    user: { ...member.user, image: avatarUrl },
                  };
                }),
              ),
            })),
          ),
        })),
      );

      return {
        ...result,
        lists: listsWithAvatarUrls,
        workspace: workspaceWithAvatarUrls,
      };
    }),
  bySlug: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/workspaces/{workspaceSlug}/boards/{boardSlug}",
        summary: "Get board by slug",
        description:
          "Retrieves a board by its slug within a specific workspace",
        tags: ["Boards"],
        protect: false,
      },
    })
    .input(
      z.object({
        workspaceSlug: z
          .string()
          .min(3)
          .max(64)
          .regex(/^(?![-]+$)[a-zA-Z0-9-]+$/),
        boardSlug: z
          .string()
          .min(3)
          .max(60)
          .regex(/^(?![-]+$)[a-zA-Z0-9-]+$/),
        members: z.array(z.string().min(12)).optional(),
        labels: z.array(z.string().min(12)).optional(),
        lists: z.array(z.string().min(12)).optional(),
        dueDateFilters: z
          .array(
            z.enum([
              "overdue",
              "today",
              "tomorrow",
              "next-week",
              "next-month",
              "no-due-date",
            ]),
          )
          .optional(),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof boardRepo.getBySlug>>>())
    .query(async ({ ctx, input }) => {
      const workspace = await workspaceRepo.getBySlugWithBoards(
        ctx.db,
        input.workspaceSlug,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with slug ${input.workspaceSlug} not found`,
          code: "NOT_FOUND",
        });

      // Convert semantic string filters to date ranges expected by the repo
      const dueDateFilters = input.dueDateFilters
        ? convertDueDateFiltersToRanges(input.dueDateFilters)
        : [];

      const result = await boardRepo.getBySlug(
        ctx.db,
        input.boardSlug,
        workspace.id,
        {
          members: input.members ?? [],
          labels: input.labels ?? [],
          lists: input.lists ?? [],
          dueDate: dueDateFilters,
        },
      );

      return result;
    }),
  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/workspaces/{workspacePublicId}/boards",
        summary: "Create board",
        description: "Creates a new board for a given workspace",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        name: z.string().min(1).max(100),
        workspacePublicId: z.string().min(12),
        lists: z.array(z.string().min(1)),
        labels: z.array(z.string().min(1)),
        type: z.enum(["regular", "template"]).optional(),
        sourceBoardPublicId: z.string().min(12).optional(),
        ownerUserId: z.string().uuid().optional(),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof boardRepo.create>>>())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with public ID ${input.workspacePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, workspace.id, "board:create");

      const ownerUserId = input.ownerUserId ?? userId;

      if (ownerUserId !== userId) {
        const currentMember = await permissionRepo.getMemberWithRole(
          ctx.db,
          userId,
          workspace.id,
        );

        if (!currentMember || currentMember.role !== "ADMIN") {
          throw new TRPCError({
            message:
              "Only workspace admins can create a board for another user",
            code: "FORBIDDEN",
          });
        }

        const ownerMember = await permissionRepo.getMemberWithRole(
          ctx.db,
          ownerUserId,
          workspace.id,
        );

        if (!ownerMember) {
          throw new TRPCError({
            message: "Board owner is not a member of this workspace",
            code: "BAD_REQUEST",
          });
        }
      }

      if (input.type === "regular") {
        const existingBoard = await boardRepo.getByName(
          ctx.db,
          input.name,
          workspace.id,
          ownerUserId,
        );

        if (existingBoard) {
          throw new TRPCError({
            message: `Board with name ${input.name} already exists for this user`,
            code: "BAD_REQUEST",
          });
        }
      }

      // If sourceBoardPublicId is provided, clone the source board
      if (input.sourceBoardPublicId) {
        // First get the source board info (ID and type)
        const sourceBoardInfo = await boardRepo.getIdByPublicId(
          ctx.db,
          input.sourceBoardPublicId,
        );

        if (!sourceBoardInfo)
          throw new TRPCError({
            message: `Source board with public ID ${input.sourceBoardPublicId} not found`,
            code: "NOT_FOUND",
          });

        // Get the full board data with the correct type
        const sourceBoard = await boardRepo.getByPublicId(
          ctx.db,
          input.sourceBoardPublicId,
          userId,
          {
            members: [],
            labels: [],
            lists: [],
            dueDate: [],
            type: sourceBoardInfo.type,
          },
        );

        if (!sourceBoard)
          throw new TRPCError({
            message: `Source board with public ID ${input.sourceBoardPublicId} not found`,
            code: "NOT_FOUND",
          });

        // Verify the source board belongs to the same workspace
        const sourceWorkspace = await workspaceRepo.getByPublicId(
          ctx.db,
          sourceBoard.workspace.publicId,
        );

        if (!sourceWorkspace || sourceWorkspace.id !== workspace.id)
          throw new TRPCError({
            message: `Source board does not belong to this workspace`,
            code: "FORBIDDEN",
          });

        let slug = generateSlug(input.name);

        const isSlugUnique = await boardRepo.isSlugUnique(ctx.db, {
          slug,
          workspaceId: workspace.id,
        });

        if (!isSlugUnique || input.type === "template")
          slug = `${slug}-${generateUID()}`;

        const result = await boardRepo.createFromSnapshot(ctx.db, {
          source: sourceBoard,
          workspaceId: workspace.id,
          createdBy: userId,
          ownerUserId,
          slug,
          name: input.name,
          type: input.type ?? "regular",
          sourceBoardId: sourceBoardInfo.id,
        });

        return result;
      }

      // Otherwise, create a new board with provided lists and labels
      let slug = generateSlug(input.name);

      const isSlugUnique = await boardRepo.isSlugUnique(ctx.db, {
        slug,
        workspaceId: workspace.id,
      });

      if (!isSlugUnique || input.type === "template")
        slug = `${slug}-${generateUID()}`;

      const result = await boardRepo.create(ctx.db, {
        publicId: generateUID(),
        slug,
        name: input.name,
        createdBy: userId,
        ownerUserId,
        workspaceId: workspace.id,
        type: input.type,
      });

      if (!result)
        throw new TRPCError({
          message: `Failed to create board`,
          code: "INTERNAL_SERVER_ERROR",
        });

      if (input.lists.length) {
        const listInputs = input.lists.map((list, index) => ({
          publicId: generateUID(),
          name: list,
          boardId: result.id,
          createdBy: userId,
          index,
        }));

        await listRepo.bulkCreate(ctx.db, listInputs);
      }

      if (input.labels.length) {
        const labelInputs = input.labels.map((label, index) => ({
          publicId: generateUID(),
          name: label,
          boardId: result.id,
          createdBy: userId,
          colourCode: colours[index % colours.length]?.code ?? "#0d9488",
        }));

        await labelRepo.bulkCreate(ctx.db, labelInputs);
      }

      return result;
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/boards/{boardPublicId}",
        summary: "Update board",
        description: "Updates a board by its public ID",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        name: z.string().min(1).optional(),
        slug: z
          .string()
          .min(3)
          .max(60)
          .regex(/^(?![-]+$)[a-zA-Z0-9-]+$/)
          .optional(),
        visibility: z.enum(["public", "private"]).optional(),
        favorite: z.boolean().optional(),
        isArchived: z.boolean().optional(),
      }),
    )
    .output(
      z
        .object({ success: z.boolean() })
        .or(z.custom<Awaited<ReturnType<typeof boardRepo.update>>>()),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
        ctx.db,
        input.boardPublicId,
      );

      if (!board)
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertCanEdit(
        ctx.db,
        userId,
        board.workspaceId,
        "board:edit",
        board.ownerUserId ?? board.createdBy ?? null,
      );

      // Handle favorite toggle separately
      if (input.favorite !== undefined) {
        if (input.favorite) {
          await boardRepo.addUserFavorite(ctx.db, userId, board.id);
        } else {
          await boardRepo.removeUserFavorite(ctx.db, userId, board.id);
        }
      }

      // Handle other updates (name, slug, visibility)
      const hasOtherUpdates =
        input.name !== undefined ||
        input.slug !== undefined ||
        input.visibility !== undefined ||
        input.isArchived !== undefined;

      if (!hasOtherUpdates) {
        // Only favorite was updated, return success
        return { success: true };
      }

      if (input.slug) {
        const isBoardSlugAvailable = await boardRepo.isBoardSlugAvailable(
          ctx.db,
          input.slug,
          board.workspaceId,
        );

        if (!isBoardSlugAvailable) {
          throw new TRPCError({
            message: `Board slug ${input.slug} is not available`,
            code: "BAD_REQUEST",
          });
        }
      }

      if (input.name) {
        const ownerUserId = board.ownerUserId ?? board.createdBy;
        const existingBoard = ownerUserId
          ? await boardRepo.getByName(
              ctx.db,
              input.name,
              board.workspaceId,
              ownerUserId,
            )
          : null;

        if (existingBoard && existingBoard.publicId !== input.boardPublicId)
          throw new TRPCError({
            message: `Board with name ${input.name} already exists`,
            code: "BAD_REQUEST",
          });
      }

      const result = await boardRepo.update(ctx.db, {
        name: input.name,
        slug: input.slug,
        boardPublicId: input.boardPublicId,
        visibility: input.visibility,
        isArchived: input.isArchived,
      });

      if (!result)
        throw new TRPCError({
          message: `Failed to update board`,
          code: "INTERNAL_SERVER_ERROR",
        });

      return result;
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/boards/{boardPublicId}",
        summary: "Delete board",
        description: "Deletes a board by its public ID",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const board = await boardRepo.getWithListIdsByPublicId(
        ctx.db,
        input.boardPublicId,
      );

      if (!board)
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertCanDelete(
        ctx.db,
        userId,
        board.workspaceId,
        "board:delete",
        board.ownerUserId ?? board.createdBy ?? null,
      );

      const listIds = board.lists.map((list) => list.id);

      const deletedAt = new Date();

      await boardRepo.softDelete(ctx.db, {
        boardId: board.id,
        deletedAt,
        deletedBy: userId,
      });

      if (listIds.length) {
        const deletedLists = await listRepo.softDeleteAllByBoardId(ctx.db, {
          boardId: board.id,
          deletedAt,
          deletedBy: userId,
        });

        if (!Array.isArray(deletedLists)) {
          throw new TRPCError({
            message: `Failed to delete lists`,
            code: "INTERNAL_SERVER_ERROR",
          });
        }

        const deletedCards = await cardRepo.softDeleteAllByListIds(ctx.db, {
          listIds,
          deletedAt,
          deletedBy: userId,
        });

        if (!Array.isArray(deletedCards)) {
          throw new TRPCError({
            message: `Failed to delete cards`,
            code: "INTERNAL_SERVER_ERROR",
          });
        }

        if (deletedCards.length) {
          const activities = deletedCards.map((card) => ({
            type: "archived" as const,
            createdBy: userId,
            cardId: card.id,
          }));

          await activityRepo.bulkCreate(ctx.db, activities);
        }
      }

      return { success: true };
    }),
  checkSlugAvailability: publicProcedure
    .meta({
      openapi: {
        summary: "Check if a board slug is available",
        method: "GET",
        path: "/boards/{boardPublicId}/check-slug-availability",
        description: "Checks if a board slug is available",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardSlug: z
          .string()
          .min(3)
          .max(60)
          .regex(/^(?![-]+$)[a-zA-Z0-9-]+$/),
        boardPublicId: z.string().min(12),
      }),
    )
    .output(
      z.object({
        isReserved: z.boolean(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
        ctx.db,
        input.boardPublicId,
      );

      if (!board)
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });

      const isBoardSlugAvailable = await boardRepo.isBoardSlugAvailable(
        ctx.db,
        input.boardSlug,
        board.workspaceId,
      );

      return {
        isReserved: !isBoardSlugAvailable,
      };
    }),
  getActivities: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/boards/{boardPublicId}/activities",
        summary: "Get board activities",
        description: "Retrieves activities for all cards in a board",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.date().nullish(),
      }),
    )
    .output(
      z.custom<
        Awaited<ReturnType<typeof activityRepo.getPaginatedBoardActivities>>
      >(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
        ctx.db,
        input.boardPublicId,
      );

      if (!board)
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, board.workspaceId, "board:view");

      const result = await activityRepo.getPaginatedBoardActivities(
        ctx.db,
        board.id,
        {
          limit: input.limit ?? undefined,
          cursor: input.cursor ?? undefined,
        },
      );

      // Generate presigned URLs for user/member avatars
      const activitiesWithAvatarUrls = await Promise.all(
        result.activities.map(async (activity) => {
          const user = activity.user;
          const member = activity.member;

          return {
            ...activity,
            user: user
              ? {
                  ...user,
                  image: user.image
                    ? await generateAvatarUrl(user.image)
                    : null,
                }
              : null,
            member: member
              ? {
                  ...member,
                  user: member.user
                    ? {
                        ...member.user,
                        image: member.user.image
                          ? await generateAvatarUrl(member.user.image)
                          : null,
                      }
                    : null,
                }
              : null,
          };
        }),
      );

      return {
        ...result,
        activities: activitiesWithAvatarUrls,
      };
    }),
  getTemplateDefault: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/boards/template-default",
        summary: "Get template default",
        description: "Retrieves template default",
        tags: ["Boards"],
        protect: false,
      },
    })
    .output(
      z.custom<Awaited<ReturnType<typeof boardRepo.getTemplateDefault>>>(),
    )
    .query(async ({ ctx }) => {
      const result = await boardRepo.getTemplateDefault(ctx.db);
      return result;
    }),
  setTemplateDefault: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/boards/template-default",
        summary: "Set template default",
        description: "Sets a template as default",
        tags: ["Boards"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        isTemplateDefault: z.boolean(),
      }),
    )
    .output(
      z.custom<Awaited<ReturnType<typeof boardRepo.setTemplateDefault>>>(),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
        ctx.db,
        input.boardPublicId,
      );

      if (!board)
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });

      // Remove current template default if exists
      const currentTemplateDefault = await boardRepo.getTemplateDefault(ctx.db);
      if (currentTemplateDefault) {
        await boardRepo.setTemplateDefault(
          ctx.db,
          currentTemplateDefault.id,
          false,
        );
      }

      await assertPermission(ctx.db, userId, board.workspaceId, "board:edit");

      const result = await boardRepo.setTemplateDefault(
        ctx.db,
        board.id,
        input.isTemplateDefault,
      );
      return result;
    }),
});
