import type { NextApiRequest, NextApiResponse } from "next";
import { TRPCError } from "@trpc/server";

import { rewardPublicRouter } from "@kan/api/routers/rewardPublic";
import { createInnerTRPCContext, createTRPCRouter } from "@kan/api/trpc";
import { createDrizzleClient } from "@kan/db/client";

const publicRouter = createTRPCRouter({
  rewardPublic: rewardPublicRouter,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.KAN_PUBLIC_API_KEY) {
    return res.status(401).json({
      message: "Unauthorized: Invalid or missing x-api-key",
    });
  }

  try {
    const db = createDrizzleClient();
    const headers = new Headers(req.headers as Record<string, string>);

    const auth = {
      api: {
        getSession: async () => null,
        signInMagicLink: async () => ({ status: true }),
        listActiveSubscriptions: async () => [],
      },
    };

    const ctx = createInnerTRPCContext({
      db,
      user: null,
      auth,
      headers,
      transport: "rest",
    });

    const caller = publicRouter.createCaller(ctx);

    const { month } = req.query as Record<string, string | undefined>;

    if (month === undefined || month === "") {
      return res.status(400).json({
        message: "month is required (YYYY-MM, e.g. 2026-04)",
      });
    }

    const result = await caller.rewardPublic.listByCalendarMonth({
      month,
    });

    return res.status(200).json(result);
  } catch (error: unknown) {
    if (error instanceof TRPCError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "BAD_REQUEST"
            ? 400
            : 500;
      return res.status(status).json({ message: error.message });
    }
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Public rewards by-month API error:", error);
    return res.status(500).json({ message });
  }
}
