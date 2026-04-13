import type { NextApiRequest, NextApiResponse } from "next";
import { createNextApiHandler } from "@trpc/server/adapters/next";

import { appRouter } from "@kan/api/root";
import { createTRPCContext } from "@kan/api/trpc";
import { env } from "~/env";
import { withRateLimit } from "@kan/api/utils/rateLimit";

import { applyCors } from "~/utils/cors";

const nextApiHandler = createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
  onError:
    env.NODE_ENV === "development"
      ? ({ path, error }) => {
          console.error(
            `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
          );
        }
      : undefined,
});

export default withRateLimit(
  { points: 100, duration: 60 },
  async (req: NextApiRequest, res: NextApiResponse) => {
    await applyCors(req, res);

    const result = await nextApiHandler(req, res);
    return result;
  },
);
