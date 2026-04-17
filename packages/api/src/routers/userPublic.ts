import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as userRepo from "@kan/db/repository/user.repo";

import { createTRPCRouter, publicProcedure } from "../trpc";

export const userPublicRouter = createTRPCRouter({
  all: publicProcedure
      .meta({
        openapi: {
          summary: "Get all workspaces",
          method: "GET",
          path: "/users",
          description: "Retrieves all users for the authenticated user",
          tags: ["Users"],
          protect: true,
        },
      })
      .input(z.void())
      .output(
        z.custom<Awaited<ReturnType<typeof userRepo.getAllForPublic>>>(),
      )
      .query(async ({ ctx }) => {
        const result = await userRepo.getAllForPublic(ctx.db);
  
        return result;
      }),
});