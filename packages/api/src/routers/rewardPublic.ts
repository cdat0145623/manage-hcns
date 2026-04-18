import { createTRPCRouter, publicProcedure } from "../trpc";
import { cardRewardConfigs, cardRewardFinalizations, cards } from "@kan/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

export const rewardPublicRouter = createTRPCRouter({
  completed: publicProcedure
    .meta({
      openapi: {
        summary: "Get completed reward evaluations",
        method: "GET",
        path: "/rewards/completed",
        tags: ["Rewards"],
      },
    })
    .input(z.void())
    .query(async ({ ctx }) => {
      const results = await ctx.db
        .select({
          card_id: cards.publicId,
          type: cardRewardConfigs.rewardType,
          bonus_amount: cardRewardConfigs.bonusAmount,
          final_percent: cardRewardFinalizations.completionPercent,
          suggestedAmount: cardRewardFinalizations.suggestedAmount,
          final_amount: cardRewardFinalizations.finalAmount,
          final_note: cardRewardFinalizations.finalNote,
          completed_at: cardRewardFinalizations.finalizedAt,
        })
        .from(cardRewardConfigs)
        .innerJoin(cardRewardFinalizations, eq(cardRewardConfigs.id, cardRewardFinalizations.configId))
        .innerJoin(cards, eq(cardRewardConfigs.cardId, cards.id))
        .where(eq(cardRewardConfigs.approvalStatus, "completed"));

      return results.map((r) => {
        const bonus = Number(r.bonus_amount || 0);
        const suggested = Number(r.suggestedAmount || 0);
        const final = Number(r.final_amount || 0);
        
        return {
          card_id: r.card_id,
          type: r.type,
          bonus_amount: bonus,
          final_percent: Number(r.final_percent),
          total_deduction: suggested - final,
          final_amount: final,
          final_note: r.final_note,
          completed_at: r.completed_at,
        };
      });
    }),

  getByCardId: publicProcedure
    .meta({
      openapi: {
        summary: "Get reward evaluation result for a card",
        method: "GET",
        path: "/cards/{id}/reward-result",
        tags: ["Rewards"],
      },
    })
    .input(z.object({ cardPublicId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select({
          card_id: cards.publicId,
          type: cardRewardConfigs.rewardType,
          bonus_amount: cardRewardConfigs.bonusAmount,
          final_percent: cardRewardFinalizations.completionPercent,
          suggestedAmount: cardRewardFinalizations.suggestedAmount,
          final_amount: cardRewardFinalizations.finalAmount,
          final_note: cardRewardFinalizations.finalNote,
          completed_at: cardRewardFinalizations.finalizedAt,
        })
        .from(cardRewardConfigs)
        .innerJoin(cardRewardFinalizations, eq(cardRewardConfigs.id, cardRewardFinalizations.configId))
        .innerJoin(cards, eq(cardRewardConfigs.cardId, cards.id))
        .where(
          and(
            eq(cards.publicId, input.cardPublicId),
            eq(cardRewardConfigs.approvalStatus, "completed")
          )
        )
        .limit(1);

      const r = result[0];
      if (!r) return null;

      const bonus = Number(r.bonus_amount || 0);
      const suggested = Number(r.suggestedAmount || 0);
      const final = Number(r.final_amount || 0);
      
      return {
        card_id: r.card_id,
        type: r.type,
        bonus_amount: bonus,
        final_percent: Number(r.final_percent),
        total_deduction: suggested - final,
        final_amount: final,
        final_note: r.final_note,
        completed_at: r.completed_at,
      };
    }),
});
