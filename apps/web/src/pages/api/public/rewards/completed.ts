import type { NextApiRequest, NextApiResponse } from "next";
import { createInnerTRPCContext, createTRPCRouter } from "@kan/api/trpc";
import { rewardPublicRouter } from "@kan/api/routers/rewardPublic";
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
    return res.status(401).json({ message: "Unauthorized: Invalid or missing x-api-key" });
  }

  try {
    const db = createDrizzleClient();
    const headers = new Headers(req.headers as Record<string, string>);

    // Mock auth for public context
    const auth = {
        api: {
            getSession: async () => null,
            signInMagicLink: async () => ({ status: true }),
            listActiveSubscriptions: async () => [],
        },
    };

    const ctx = createInnerTRPCContext({
      db,
      user: null, // Public API, no session user
      auth,
      headers,
      transport: "rest",
    });

    const caller = publicRouter.createCaller(ctx);

    const result = await caller.rewardPublic.completed();

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Public rewards API error:", error);
    return res.status(500).json({ 
      message: error.message ?? "Internal server error" 
    });
  }
}
