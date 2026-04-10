import { stripe } from "@better-auth/stripe";
import { apiKey } from "better-auth/plugins";

import type { dbClient } from "@kan/db/client";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as subscriptionRepo from "@kan/db/repository/subscription.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { sendEmail } from "@kan/email";
import { createLogger } from "@kan/logger";
import { generateUID } from "@kan/shared/utils";

const log = createLogger("auth");
import { createStripeClient } from "@kan/stripe";

import { socialProvidersPlugin } from "./providers";
import { triggerWorkflow } from "./utils";

export function createPlugins(db: dbClient) {
  return [
    ...(process.env.NEXT_PUBLIC_KAN_ENV === "cloud"
      ? [
          stripe({
            stripeClient: createStripeClient(),
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
            createCustomerOnSignUp: true,
            subscription: {
              enabled: true,
              plans: [
                {
                  name: "team",
                  priceId: process.env.STRIPE_TEAM_PLAN_MONTHLY_PRICE_ID!,
                  annualDiscountPriceId:
                    process.env.STRIPE_TEAM_PLAN_YEARLY_PRICE_ID!,
                  freeTrial: {
                    days: 14,
                    onTrialStart: async (subscription) => {
                      await triggerWorkflow(db, "trial-start", subscription);
                    },
                    onTrialEnd: async ({ subscription }) => {
                      await triggerWorkflow(db, "trial-end", subscription);
                    },
                    onTrialExpired: async (subscription) => {
                      await triggerWorkflow(db, "trial-expired", subscription);
                    },
                  },
                },
                {
                  name: "pro",
                  priceId: process.env.STRIPE_PRO_PLAN_MONTHLY_PRICE_ID!,
                  annualDiscountPriceId:
                    process.env.STRIPE_PRO_PLAN_YEARLY_PRICE_ID!,
                  freeTrial: {
                    days: 14,
                    onTrialStart: async (subscription) => {
                      await triggerWorkflow(db, "trial-start", subscription);
                    },
                    onTrialEnd: async ({ subscription }) => {
                      await triggerWorkflow(db, "trial-end", subscription);
                    },
                    onTrialExpired: async (subscription) => {
                      await triggerWorkflow(db, "trial-expired", subscription);
                    },
                  },
                },
              ],
              authorizeReference: async (data) => {
                const workspace = await workspaceRepo.getByPublicId(
                  db,
                  data.referenceId,
                );

                if (!workspace) {
                  return Promise.resolve(false);
                }

                const isUserInWorkspace = await workspaceRepo.isUserInWorkspace(
                  db,
                  data.user.id,
                  workspace.id,
                );

                return isUserInWorkspace;
              },
              getCheckoutSessionParams: () => {
                return {
                  params: {
                    allow_promotion_codes: true,
                  },
                };
              },
              onSubscriptionComplete: async ({
                subscription,
                stripeSubscription,
              }) => {
                // Set unlimited seats to true for pro plans
                if (subscription.plan === "pro") {
                  await subscriptionRepo.updateByStripeSubscriptionId(
                    db,
                    stripeSubscription.id,
                    {
                      unlimitedSeats: true,
                    },
                  );
                  log.info({ subscriptionId: stripeSubscription.id }, "Pro subscription activated with unlimited seats");

                  const workspace = await workspaceRepo.getByPublicId(
                    db,
                    subscription.referenceId,
                  );

                  if (workspace?.id) {
                    await memberRepo.unpauseAllMembers(db, workspace.id);
                  }
                }
              },
              onSubscriptionCancel: async ({
                subscription,
                cancellationDetails,
              }) => {
                await triggerWorkflow(
                  db,
                  "subscription-canceled",
                  subscription,
                  cancellationDetails,
                );

                // for cancelled subscriptions, we need to pause all members and set their workspace plan to free
                const workspace = await workspaceRepo.getByPublicId(
                  db,
                  subscription.referenceId,
                );

                if (workspace?.id) {
                  await memberRepo.pauseAllMembers(db, workspace.id);

                  // Reset slug to publicId, or generate a UID if publicId is taken
                  let newSlug = workspace.publicId;

                  if (workspace.slug !== workspace.publicId) {
                    const isPublicIdAvailable =
                      await workspaceRepo.isWorkspaceSlugAvailable(
                        db,
                        workspace.publicId,
                      );
                    if (!isPublicIdAvailable) {
                      newSlug = generateUID();
                    }
                  }

                  await workspaceRepo.update(db, subscription.referenceId, {
                    plan: "free",
                    slug: newSlug,
                  });
                }
              },
              onSubscriptionUpdate: async ({ subscription }) => {
                await triggerWorkflow(db, "subscription-updated", subscription);
              },
            },
          }),
        ]
      : []),
    apiKey({
      enableSessionForAPIKeys: true,
      customAPIKeyGetter: (ctx) => {
        const authorization = ctx.headers?.get("authorization");
        if (authorization?.startsWith("Bearer ")) {
          return authorization.slice(7);
        }
        return ctx.headers?.get("x-api-key") ?? undefined;
      },
      rateLimit: {
        enabled: true,
        timeWindow: 1000 * 60, // 1 minute
        maxRequests: 100, // 100 requests per minute
      },
    }),
  ];
}
