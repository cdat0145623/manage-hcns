import { betterAuth, APIError, generateId } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { z } from "zod";
import { env } from "next-runtime-env";

import type { dbClient } from "@kan/db/client";
import * as schema from "@kan/db/schema";
import { sendEmail } from "@kan/email";

import { createDatabaseHooks, createMiddlewareHooks } from "./hooks";
import { createPlugins } from "./plugins";

const signUpUsernamePlugin = () => ({
  id: "sign-up-username",
  endpoints: {
    signUpUsername: createAuthEndpoint(
      "/sign-up-username",
      {
        method: "POST",
        body: z.object({
          username: z.string().min(3),
          password: z.string().min(8),
          name: z.string().min(1),
          email: z.string().email(),
          emailVerified: z.boolean(),
          callbackURL: z.string().optional(),
        }),
      },
      async (ctx) => {
        const { username: normalizedUsername, password, name, email, emailVerified } = ctx.body;
        const usernameLower = normalizedUsername.toLowerCase();

        // Check if username exists
        const existingUser = await ctx.context.adapter.findOne({
          model: "user",
          where: [{ field: "username", value: usernameLower }],
        });

        if (existingUser) {
          throw new APIError("BAD_REQUEST", {
            message: "Username already taken",
          });
        }

        const hashedPassword = await ctx.context.password.hash(password);
        const userId = generateId();

        const user = await ctx.context.adapter.create({
          model: "user",
          data: {
            id: userId,
            name,
            username: usernameLower,
            password: hashedPassword,
            email: email,
            emailVerified: emailVerified,
            // Account fields for single-table setup
            accountId: userId,
            providerId: "credential",
            userId: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        const session = await ctx.context.internalAdapter.createSession(
          user.id,
        );
        if (!session) {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Failed to create session",
          });
        }

        await setSessionCookie(ctx, { session, user: user as any });

        return ctx.json({ user, session });
      },
    ),
  },
});

const signInUsernamePlugin = () => ({
  id: "sign-in-username",
  endpoints: {
    signInUsername: createAuthEndpoint(
      "/sign-in-username",
      {
        method: "POST",
        body: z.object({
          username: z.string(),
          password: z.string(),
          callbackURL: z.string().optional(),
        }),
      },
      async (ctx) => {
        const { username, password } = ctx.body;

        const user = await ctx.context.adapter.findOne<{
          id: string;
          password: string | null;
          email: string;
          name: string;
          emailVerified: boolean;
          image: string | null;
          username: string;
        }>({
          model: "user",
          where: [{ field: "username", value: username.toLowerCase() }],
        });

        if (!user || !user.password) {
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid username or password",
          });
        }

        // ctx.context.password.hash dùng bcrypt, verify dùng bcrypt.compare
        const isValid = await ctx.context.password.verify({
          hash: user.password,
          password,
        });

        if (!isValid) {
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid username or password",
          });
        }

        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Failed to create session",
          });
        }

        await setSessionCookie(ctx, { session, user: user as any });

        return ctx.json({ user, session });
      },
    ),
  },
});

export const initAuth = (db: dbClient) => {
  const baseURL = env("NEXT_PUBLIC_BASE_URL") || env("BETTER_AUTH_URL");
  const authPath = "/api/auth";
  const fullBaseURL = baseURL ? `${baseURL}${authPath}` : undefined;

  const trustedOrigins =
    env("BETTER_AUTH_TRUSTED_ORIGINS")?.split(",").filter(Boolean) ?? [];

  return betterAuth({
    secret: env("BETTER_AUTH_SECRET"),
    baseURL: fullBaseURL,
    trustedOrigins: [...(fullBaseURL ? [fullBaseURL] : []), ...trustedOrigins],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.session,
        account: schema.users, // Map credentials to user table
      },
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24 * 2, // Update session expiry every 48 hours if user is active
      freshAge: 0,
    },
    emailAndPassword: {
      enabled: env("NEXT_PUBLIC_ALLOW_CREDENTIALS")?.toLowerCase() === "true",
      // Sign-up restriction is handled by the user.create.before database
      // hook which checks for pending invitations, allowing invited users
      // to register even when public sign-up is disabled.
      disableSignUp: false,
      sendResetPassword: async (data) => {
        await sendEmail(data.user.email, "Reset Password", "RESET_PASSWORD", {
          resetPasswordUrl: data.url,
          resetPasswordToken: data.token,
        });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
      },
      additionalFields: {
        username: {
          type: "string",
          required: false,
        },
        password: {
          type: "string",
          required: false,
        },
        stripeCustomerId: {
          type: "string",
          required: false,
          defaultValue: null,
          input: false,
        },
      },
    },
    plugins: [
      username(),
      signUpUsernamePlugin(),
      signInUsernamePlugin(),
      ...createPlugins(db),
    ],
    databaseHooks: createDatabaseHooks(db),
    hooks: createMiddlewareHooks(db),
    advanced: {
      cookiePrefix: "kan",
      database: {
        generateId: false,
      },
    },
  });
};
