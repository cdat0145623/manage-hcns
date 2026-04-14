import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as positionRepo from "@kan/db/repository/position.repo";
import * as userRepo from "@kan/db/repository/user.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const positionRouter = createTRPCRouter({
  all: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/positions",
        summary: "Get all positions",
        description: "Retrieves all active positions",
        tags: ["Positions"],
        protect: true,
      },
    })
    .input(z.void())
    .query(async ({ ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Permission check: Only ADMIN can manage positions
      const user = await userRepo.getById(ctx.db, userId);
      if (!user || user.role !== "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Only administrators can view positions",
        });
      }

      return await positionRepo.getAll(ctx.db);
    }),

  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/positions",
        summary: "Create position",
        description: "Creates a new position",
        tags: ["Positions"],
        protect: true,
      },
    })
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const user = await userRepo.getById(ctx.db, userId);
      if (!user || user.role !== "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Only administrators can create positions",
        });
      }

      return await positionRepo.create(ctx.db, {
        ...input,
        createdBy: userId,
      });
    }),

  update: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/positions",
        summary: "Update position",
        description: "Updates an existing position",
        tags: ["Positions"],
        protect: true,
      },
    })
    .input(
      z.object({
        publicId: z.string().length(12),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const user = await userRepo.getById(ctx.db, userId);
      if (!user || user.role !== "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Only administrators can update positions",
        });
      }

      return await positionRepo.update(ctx.db, input);
    }),

  delete: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/positions/{publicId}",
        summary: "Delete position",
        description: "Soft deletes a position",
        tags: ["Positions"],
        protect: true,
      },
    })
    .input(
      z.object({
        publicId: z.string().length(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const user = await userRepo.getById(ctx.db, userId);
      if (!user || user.role !== "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Only administrators can delete positions",
        });
      }

      return await positionRepo.softDelete(ctx.db, {
        publicId: input.publicId,
        deletedAt: new Date(),
        deletedBy: userId,
      });
    }),
});
