import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as userRepo from "@kan/db/repository/user.repo";
import * as activityRepo from "@kan/db/repository/cardActivity.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { initAuth, hashPassword } from "@kan/auth/server";
import { generateAvatarUrl } from "@kan/shared/utils";
import { memberRoles, cardActivities } from "@kan/db/schema";

export const userRouter = createTRPCRouter({
  getUser: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/me",
        summary: "Get user",
        description:
          "Retrieves the currently authenticated user's profile information",
        tags: ["Users"],
        protect: true,
      },
    })
    .input(z.void())
    .output(
      z.object({
        id: z.string(),
        email: z.string().nullable(),
        username: z.string().nullable(),
        name: z.string().nullable(),
        image: z.string().nullable(),
        stripeCustomerId: z.string().nullable(),
        role: z.string().nullable(),
        apiKey: z
          .object({
            id: z.number(),
            prefix: z.string().nullable(),
          })
          .nullable(),
      }),
    )
    .query(async ({ ctx }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const result = await userRepo.getById(ctx.db, userId);

      if (!result) {
        throw new TRPCError({
          message: `User not found`,
          code: "NOT_FOUND",
        });
      }

      const apiKey = result.apiKeys[0];

      // Generate presigned URL for avatar
      const imageUrl = await generateAvatarUrl(result.image);

      return {
        ...result,
        image: imageUrl,
        apiKey: apiKey ? { id: apiKey.id, prefix: apiKey.prefix } : null,
      };
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/users",
        summary: "Update user",
        description:
          "Updates a user's profile information. Admin can update other users by providing targetUserId.",
        tags: ["Users"],
        protect: true,
      },
    })
    .input(
      z.object({
        targetUserId: z.string().optional(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        image: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        workspacePublicId: z.string(),
      }),
    )
    .output(
      z.object({
        name: z.string().nullable(),
        image: z.string().nullable(),
        email: z.string().nullable(),
        username: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      // Determine target user: if targetUserId is provided, admin is editing another user
      const editUserId = input.targetUserId ?? userId;

      if (input.targetUserId && input.targetUserId !== userId) {
        // Verify current user is ADMIN
        const currentUser = await userRepo.getById(ctx.db, userId);
        if (!currentUser || currentUser.role !== "ADMIN") {
          throw new TRPCError({
            message: `Only admins can edit other users`,
            code: "UNAUTHORIZED",
          });
        }
      }

      const auth = initAuth(ctx.db);
      const hashedPassword = input.password ? await hashPassword(auth, input.password) : undefined;

      const prevUser = await userRepo.getById(ctx.db, editUserId);

      if (!prevUser) {
        throw new TRPCError({
          message: `User not found`,
          code: "NOT_FOUND",
        });
      }

      const result = await userRepo.update(ctx.db, editUserId, {
        name: input.name,
        email: input.email,
        image: input.image,
        username: input.username,
        password: hashedPassword,
      });

      if (!result) {
        throw new TRPCError({
          message: `User not found`,
          code: "NOT_FOUND",
        });
      }

      const workspaceMember = await workspaceRepo.getMemberByPublicIdAndUserId(ctx.db, input.workspacePublicId, editUserId);

      if (!workspaceMember) {
        throw new TRPCError({
          message: `Workspace member not found`,
          code: "NOT_FOUND",
        });
      }

      if (input.name && input.name !== prevUser.name) {
        await activityRepo.updateAccountInformation(ctx.db, {
            type: "updated_name" as const,
            workspaceMemberId: workspaceMember.id,
            createdBy: userId,
            oldValue: prevUser.name ?? "",
            newValue: input.name ?? "",
          },
        );
      }

      if (input.email && input.email !== prevUser.email) {
        await activityRepo.updateAccountInformation(ctx.db, {
            type: "updated_email" as const,
            workspaceMemberId: workspaceMember.id,
            createdBy: userId,
            oldValue: prevUser.email ?? "",
            newValue: input.email ?? "",
          },
        );
        await userRepo.updateEmailInWorkspaceMembers(ctx.db, editUserId, input.email);
      }

      if (input.username && input.username !== prevUser.username) {
        await activityRepo.updateAccountInformation(ctx.db, {
            type: "updated_username" as const,
            workspaceMemberId: workspaceMember.id,
            createdBy: userId,
            oldValue: prevUser.username ?? "",
            newValue: input.username ?? "",
          },
        );
      }

      if (input.password) {
        await activityRepo.updateAccountInformation(ctx.db, {
            type: "updated_password" as const,
            workspaceMemberId: workspaceMember.id,
            createdBy: userId,
            newValue: hashedPassword ?? "",
          },
        );
      }
      
      // Generate presigned URL for avatar
      const imageUrl = await generateAvatarUrl(result.image);

      return {
        ...result,
        image: imageUrl,
      };
    }),
  getAll: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users",
        summary: "Get all users without Admin role",
        description:
          "Retrieves all users without Admin role",
        tags: ["Users"],
        protect: true,
      },
    })
    .input(z.void())
    .output(
      z.array(
        z.object({
          id: z.string(),
          email: z.string().nullable(),
          username: z.string().nullable(),
          name: z.string().nullable(),
          role: z.enum(memberRoles),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      return await userRepo.getAll(ctx.db);
    }),
    create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/users",
        summary: "Create user",
        description:
          "Creates a new user",
        tags: ["Users"],
        protect: true,
      },
    })
    .input(
      z.object({
        name: z.string(),
        email: z.string().email(),
        username: z.string(),
        password: z.string(),
        role: z.enum(memberRoles),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        email: z.string().nullable(),
        username: z.string().nullable(),
        name: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const user = await userRepo.getById(ctx.db, userId);

      if (!user) {
        throw new TRPCError({
          message: `User not found`,
          code: "NOT_FOUND",
        });
      }

      if (user.role !== "ADMIN") {
        throw new TRPCError({
          message: `User is not admin`,
          code: "UNAUTHORIZED",
        });
      }
        
      const auth = initAuth(ctx.db);

      const response = await auth.api.signUpUsername({
        body: {
          username: input.username,
          password: input.password,
          name: input.name,
          email: input.email,
          emailVerified: true,
          role: input.role,
        },
        headers: new Headers(), // Prevents session cookie from overwriting admin's cookie
      });

      if (!response?.user) {
        throw new TRPCError({
          message: `Unable to create user`,
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      const { id, email, username, name } = response.user;

      return { id, email, username, name };
    }),
  updateStatus: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/users/update-status",
        summary: "Update status user",
        description: "Deactivates a user by setting isActive to false",
        tags: ["Users"],
        protect: true,
      },
    })
    .input(
      z.object({
        targetUserId: z.string(),
        isActive: z.boolean(),
        workspacePublicId: z.string(),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      // Verify current user is ADMIN
      const currentUser = await userRepo.getById(ctx.db, userId);
      if (!currentUser || currentUser.role !== "ADMIN") {
        throw new TRPCError({
          message: `Only admins can deactivate users`,
          code: "UNAUTHORIZED",
        });
      }

      // Prevent deactivating yourself
      if (input.targetUserId === userId) {
        throw new TRPCError({
          message: `Cannot deactivate your own account`,
          code: "BAD_REQUEST",
        });
      }

      const result = await userRepo.updateStatus(ctx.db, input.targetUserId, input.isActive);

      if (!result) {
        throw new TRPCError({
          message: `User not found`,
          code: "NOT_FOUND",
        });
      }

      const workspaceMember = await workspaceRepo.getMemberByPublicIdAndUserId(ctx.db, input.workspacePublicId, input.targetUserId);

      if (!workspaceMember) {
        throw new TRPCError({
          message: `Workspace member not found`,
          code: "NOT_FOUND",
        });
      }

      if (input.isActive) {
        await activityRepo.updateAccountInformation(ctx.db, {
            type: "status_changed" as const,
            workspaceMemberId: workspaceMember.id,
            createdBy: userId,
            oldValue: "inactive",
            newValue: "active",
          },
        );
      } else {
        await activityRepo.updateAccountInformation(ctx.db, {
            type: "status_changed" as const,
            workspaceMemberId: workspaceMember.id,
            createdBy: userId,
            oldValue: "active",
            newValue: "inactive",
          },
        );
      }

      return { success: true };
    }),
});