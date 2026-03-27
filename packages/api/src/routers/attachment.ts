import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as cardAttachmentRepo from "@kan/db/repository/cardAttachment.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { createLogger } from "@kan/logger";
import { generateUID } from "@kan/shared/utils";
import { generateUploadUrl } from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertPermission } from "../utils/permissions";

const logger = createLogger("attachment");

export const attachmentRouter = createTRPCRouter({
  generateUploadUrl: protectedProcedure
    .meta({
      openapi: {
        summary: "Generate presigned URL for attachment upload",
        method: "POST",
        path: "/cards/{cardPublicId}/attachments/upload-url",
        description:
          "Generates a presigned URL for uploading an attachment to S3",
        tags: ["Attachments"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        filename: z.string().min(1).max(255),
        contentType: z.string(),
        size: z.number().positive().max(50 * 1024 * 1024),
      }),
    )
    .output(z.object({ url: z.string(), key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });
      await assertPermission(ctx.db, userId, card.workspaceId, "card:edit");

      // Get workspace publicId
      const workspace = await workspaceRepo.getById(ctx.db, card.workspaceId);
      if (!workspace)
        throw new TRPCError({
          message: `Workspace not found`,
          code: "NOT_FOUND",
        });

      const bucket = process.env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME;
      if (!bucket)
        throw new TRPCError({
          message: `Attachments bucket not configured`,
          code: "INTERNAL_SERVER_ERROR",
        });

      // Sanitize filename
      const sanitizedFilename = input.filename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 200);

      const s3Key = `${workspace.publicId}/${input.cardPublicId}/${generateUID()}-${sanitizedFilename}`;

      let url = await generateUploadUrl(
        bucket,
        s3Key,
        input.contentType,
        3600, // 1 hour
      );

      if (process.env.NEXT_PUBLIC_KAN_ENV !== "cloud") {
        const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        if (url.startsWith(endpoint)) {
          url = url.replace(endpoint, `${appUrl}/api/minio`);
        }
      }

      return { url, key: s3Key };
    }),
  confirm: protectedProcedure
    .meta({
      openapi: {
        summary: "Confirm attachment upload and save to database",
        method: "POST",
        path: "/cards/{cardPublicId}/attachments/confirm",
        description:
          "Confirms an attachment upload and saves the record to the database",
        tags: ["Attachments"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        s3Key: z.string(),
        filename: z.string(),
        originalFilename: z.string(),
        contentType: z.string(),
        size: z.number().positive(),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof cardAttachmentRepo.create>>>())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });
      await assertPermission(ctx.db, userId, card.workspaceId, "card:edit");

      const attachment = await cardAttachmentRepo.create(ctx.db, {
        cardId: card.id,
        filename: input.filename,
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        size: input.size,
        s3Key: input.s3Key,
        createdBy: userId,
      });

      if (!attachment) {
        throw new TRPCError({
          message: "Failed to create attachment",
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.attachment.added",
        cardId: card.id,
        attachmentId: attachment.id,
        toTitle: input.originalFilename,
        createdBy: userId,
      });

      return attachment;
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Rename an attachment",
        method: "PUT",
        path: "/attachments/{attachmentPublicId}",
        description: "Renames an attachment by its public ID",
        tags: ["Attachments"],
        protect: true,
      },
    })
    .input(
      z.object({
        attachmentPublicId: z.string().min(12),
        originalFilename: z.string().min(1).max(255),
      }),
    )
    .output(z.object({ publicId: z.string(), originalFilename: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const attachment = await cardAttachmentRepo.getByPublicId(
        ctx.db,
        input.attachmentPublicId,
      );

      if (!attachment || attachment.deletedAt)
        throw new TRPCError({
          message: `Attachment with public ID ${input.attachmentPublicId} not found`,
          code: "NOT_FOUND",
        });

      const workspaceId = attachment.card.list.board.workspaceId;
      await assertPermission(ctx.db, userId, workspaceId, "card:edit");

      const previousFilename = attachment.originalFilename;

      const updated = await cardAttachmentRepo.updateOriginalFilename(ctx.db, {
        attachmentId: attachment.id,
        originalFilename: input.originalFilename,
      });

      if (!updated)
        throw new TRPCError({
          message: `Failed to rename attachment`,
          code: "INTERNAL_SERVER_ERROR",
        });

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.attachment.renamed",
        cardId: attachment.cardId,
        attachmentId: attachment.id,
        toTitle: updated.originalFilename,
        fromTitle: previousFilename,
        createdBy: userId,
      });

      return {
        publicId: input.attachmentPublicId,
        originalFilename: updated.originalFilename,
      };
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete an attachment",
        method: "DELETE",
        path: "/attachments/{attachmentPublicId}",
        description: "Soft deletes an attachment and removes the local file",
        tags: ["Attachments"],
        protect: true,
      },
    })
    .input(z.object({ attachmentPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const attachment = await cardAttachmentRepo.getByPublicId(
        ctx.db,
        input.attachmentPublicId,
      );

      if (!attachment || attachment.deletedAt)
        throw new TRPCError({
          message: `Attachment with public ID ${input.attachmentPublicId} not found`,
          code: "NOT_FOUND",
        });

      const workspaceId = attachment.card.list.board.workspaceId;
      await assertPermission(ctx.db, userId, workspaceId, "card:edit");

      if (attachment.s3Key.startsWith("/attachments/")) {
        const fs = await import("fs/promises");
        const path = await import("path");
        try {
          const sanitizedPath = path
            .normalize(attachment.s3Key)
            .replace(/^(\.\.[/\\\\])+/, "");
          if (sanitizedPath.startsWith("/attachments/")) {
            const filePath = path.join(process.cwd(), "public", sanitizedPath);
            await fs.unlink(filePath).catch((e: unknown) => {
              logger.error({ err: e }, "Failed to delete local file");
            });
          }
        } catch (error) {
          logger.error(
            { err: error },
            `Failed to delete local attachment: ${attachment.s3Key}`,
          );
        }
      }

      await cardAttachmentRepo.softDelete(ctx.db, {
        attachmentId: attachment.id,
        deletedAt: new Date(),
      });

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.attachment.removed",
        cardId: attachment.cardId,
        attachmentId: attachment.id,
        fromTitle: attachment.originalFilename,
        createdBy: userId,
      });

      return { success: true };
    }),
  getByCardId: protectedProcedure
    .meta({
      openapi: {
        summary: "Get attachments by card ID",
        method: "GET",
        path: "/cards/{cardPublicId}/attachments",
        description: "Fetch all attachments belonging to a specific card",
        tags: ["Attachments"],
        protect: true,
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(z.array(z.custom<Awaited<ReturnType<typeof cardAttachmentRepo.getAllByCardId>>[0]>()))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      const workspace = await workspaceRepo.getById(ctx.db, card.workspaceId);
      if (!workspace)
        throw new TRPCError({
          message: `Workspace not found`,
          code: "NOT_FOUND",
        });

      // Fetch all non-deleted attachments
      const attachments = await cardAttachmentRepo.getAllByCardId(
        ctx.db,
        card.id,
      );

      return attachments;
    }),
});
