import type { NextApiRequest, NextApiResponse } from "next";

import { createInnerTRPCContext } from "@kan/api/trpc";
import { dashboardPublicRouter } from "@kan/api/routers/dashboardPublic";
import { createTRPCRouter } from "@kan/api/trpc";
import { initAuth } from "@kan/auth/server";
import { createDrizzleClient } from "@kan/db/client";

const publicRouter = createTRPCRouter({
  dashboardPublic: dashboardPublicRouter,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Kiểm tra API key
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.KAN_PUBLIC_API_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
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

    // Lấy userId từ query hoặc để null — middleware sẽ xử lý
    const ctx = createInnerTRPCContext({
      db,
      user: null,
      auth,
      headers,
      transport: "rest",
    });

    const caller = publicRouter.createCaller(ctx);

    const {
      selectedUserId,
      boardPublicId,
      viewMode,
      month,
      week,
      year,
    } = req.query as Record<string, string>;

    if (!selectedUserId) {
      return res.status(400).json({ message: "selectedUserId is required" });
    }

    const result = await caller.dashboardPublic.get({
      selectedUserId,
      boardPublicId,
      viewMode: viewMode as "week" | "month" | "year" | undefined,
      month: month ? Number(month) : undefined,
      week: week ? Number(week) : undefined,
      year: year ? Number(year) : undefined,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Public dashboard API error:", error);
    return res.status(500).json({ message: error.message ?? "Internal server error" });
  }
}