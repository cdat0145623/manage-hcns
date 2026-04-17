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

  const { id } = req.query;
  const cardPublicId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : null;

  if (!cardPublicId) {
    return res.status(400).json({ message: "Missing card ID" });
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
      user: null, 
      auth,
      headers,
      transport: "rest",
    });

    const caller = publicRouter.createCaller(ctx);

    const result = await caller.rewardPublic.getByCardId({ cardPublicId });

    if (!result) {
      return res.status(404).json({ message: "Reward result not found or not completed for this card" });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Public single reward API error:", error);
    return res.status(500).json({ 
      message: error.message ?? "Internal server error" 
    });
  }
}
