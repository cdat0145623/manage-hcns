import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as userRepo from "@kan/db/repository/user.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { initAuth } from "@kan/auth/server";
import { generateAvatarUrl } from "@kan/shared/utils";
import { memberRoles } from "@kan/db/schema";

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
          "Updates the currently authenticated user's profile information",
        tags: ["Users"],
        protect: true,
      },
    })
    .input(
      z.object({
        name: z.string().optional(),
        image: z.string().optional(),
        username: z.string().optional(),
      }),
    )
    .output(
      z.object({
        name: z.string().nullable(),
        image: z.string().nullable(),
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

      const result = await userRepo.update(ctx.db, userId, input);

      if (!result) {
        throw new TRPCError({
          message: `User not found`,
          code: "NOT_FOUND",
        });
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
});