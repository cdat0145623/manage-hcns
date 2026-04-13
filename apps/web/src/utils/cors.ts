import type { NextApiRequest, NextApiResponse } from "next";
import cors from "nextjs-cors";
import { env } from "~/env";

/**
 * Applies CORS headers to an API request.
 * 
 * @param req - The Next.js API request object
 * @param res - The Next.js API response object
 */
export const applyCors = async (req: NextApiRequest, res: NextApiResponse) => {
  const allowedOrigins: string[] = [];
  
  // Use a type cast to workaround linting issues with the env object
  const envConfig = env as { CORS_ORIGINS?: string; NEXT_PUBLIC_BASE_URL?: string };
  
  const corsOriginsEnv = envConfig.CORS_ORIGINS;
  if (corsOriginsEnv) {
    allowedOrigins.push(...corsOriginsEnv.split(",").filter(Boolean));
  }
  
  // Also trust the base URL if it exists
  const baseUrl = envConfig.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) {
    try {
       const url = new URL(baseUrl);
       if (!allowedOrigins.includes(url.origin)) {
         allowedOrigins.push(url.origin);
       }
    } catch {
       // Ignore invalid URL
    }
  }

  await cors(req, res, {
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  });
};
