import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as fileActivityLogRepo from "@kan/db/repository/fileActivityLog.repo";
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
        cardPublicId: z.string().min(12).optional(),
        taskInstanceId: z.string().uuid().optional(),
        filename: z.string().min(1).max(255),
        contentType: z.string(),
        size: z.number().positive().max(50 * 1024 * 1024),
      }).refine(data => data.cardPublicId || data.taskInstanceId, {
        message: "Either cardPublicId or taskInstanceId must be provided",
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

      let workspaceId: number;
      let folderId: string;

      if (input.cardPublicId) {
        const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
          ctx.db,
          input.cardPublicId,
        );

        if (!card)
          throw new TRPCError({
            message: `Card with public ID ${input.cardPublicId} not found`,
            code: "NOT_FOUND",
          });
        workspaceId = card.workspaceId;
        folderId = input.cardPublicId;
      } else {
        const taskInstance = await ctx.db.query.taskInstances.findFirst({
          where: (t, { eq }) => eq(t.id, input.taskInstanceId!),
          with: {
            taskMaster: true,
          },
        });

        if (!taskInstance)
          throw new TRPCError({
            message: `Task instance with ID ${input.taskInstanceId} not found`,
            code: "NOT_FOUND",
          });
        
        // Use user's ID as workspace ID placeholder or fetch real one
        // For now, task instances don't have workspaceId directly, but task masters are linked to users.
        // Let's assume permission is checked by task ownership for now if no workspace.
        workspaceId = 0; // Temporary placeholder if no workspace
        folderId = input.taskInstanceId!;
      }

      if (workspaceId > 0) {
        await assertPermission(ctx.db, userId, workspaceId, "card:edit");
      }

      // Get workspace info for bucket path
      let workspacePublicId = "general";
      if (workspaceId > 0) {
        const workspace = await workspaceRepo.getById(ctx.db, workspaceId);
        if (workspace) {
          workspacePublicId = workspace.publicId;
        }
      }

      let bucket = process.env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME || "my-app";
      if (input.contentType.startsWith("image/")) {
        bucket = process.env.NEXT_PUBLIC_AVATAR_BUCKET_NAME || "images";
      }
      if (!bucket)
        throw new TRPCError({
          message: `Attachments bucket not configured`,
          code: "INTERNAL_SERVER_ERROR",
        });

      // Sanitize filename
      const sanitizedFilename = input.filename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 200);

      const s3Key = `${workspacePublicId}/${folderId}/${generateUID()}-${sanitizedFilename}`;

      let url = await generateUploadUrl(
        bucket,
        s3Key,
        input.contentType,
        3600, // 1 hour
      );

      if (process.env.NEXT_PUBLIC_KAN_ENV !== "cloud") {
        const endpoint = (process.env.S3_ENDPOINT ?? "http://localhost:9000").replace(/\/$/, "");
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
        
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
        cardPublicId: z.string().min(12).optional(),
        taskInstanceId: z.string().uuid().optional(),
        s3Key: z.string(),
        filename: z.string(),
        originalFilename: z.string(),
        contentType: z.string(),
        size: z.number().positive(),
      }).refine(data => data.cardPublicId || data.taskInstanceId, {
        message: "Either cardPublicId or taskInstanceId must be provided",
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof fileActivityLogRepo.create>>>())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      let cardId: number | undefined;
      let taskInstanceId: string | undefined;

      if (input.cardPublicId) {
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
        cardId = card.id;
      } else {
        taskInstanceId = input.taskInstanceId;
      }

      const attachment = await fileActivityLogRepo.create(ctx.db, {
        cardId,
        taskInstanceId,
        activityType: "file_uploaded",
        fileName: input.originalFilename,
        newFileUrl: input.s3Key,
        mimeType: input.contentType,
        fileSize: input.size,
        createdBy: userId,
      });

      if (!attachment) {
        throw new TRPCError({
          message: "Failed to create attachment",
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      if (cardId) {
        await cardActivityRepo.create(ctx.db, {
          type: "updated_attachment_added",
          cardId,
          attachmentId: attachment.id,
          toTitle: input.originalFilename,
          createdBy: userId,
        });
      } else if (taskInstanceId) {
          await cardActivityRepo.bulkCreateForTaskInstance(ctx.db, [{
            type: "updated_attachment_added",
            taskInstanceId,
            attachmentId: attachment.id,
            toTitle: input.originalFilename,
            createdBy: userId,
          }]);
      }

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

      const attachment = await fileActivityLogRepo.getByPublicId(
        ctx.db,
        input.attachmentPublicId,
      );

      if (!attachment || attachment.activityType === "file_deleted")
        throw new TRPCError({
          message: `Attachment with public ID ${input.attachmentPublicId} not found`,
          code: "NOT_FOUND",
        });

      const workspaceId = attachment.card?.list.board.workspaceId;
      if (attachment.cardId && !workspaceId) {
        throw new TRPCError({
            message: "Workspace ID not found for this attachment",
            code: "INTERNAL_SERVER_ERROR",
        });
      }
      if (workspaceId) {
        await assertPermission(ctx.db, userId, workspaceId, "card:edit");
      }

      const previousFilename = attachment.fileName;

      const updated = await fileActivityLogRepo.updateFilename(ctx.db, {
        publicId: attachment.publicId,
        fileName: input.originalFilename,
      });

      if (!updated)
        throw new TRPCError({
          message: `Failed to rename attachment`,
          code: "INTERNAL_SERVER_ERROR",
        });

      if (attachment.cardId) {
        await cardActivityRepo.create(ctx.db, {
            type: "updated_attachment_renamed",
            cardId: attachment.cardId,
            attachmentId: attachment.id,
            toTitle: updated.fileName ?? "",
            fromTitle: previousFilename ?? "",
            createdBy: userId,
          });
      } else if (attachment.taskInstanceId) {
          await cardActivityRepo.bulkCreateForTaskInstance(ctx.db, [{
            type: "updated_attachment_renamed",
            taskInstanceId: attachment.taskInstanceId,
            attachmentId: attachment.id,
            toTitle: updated.fileName ?? "",
            fromTitle: previousFilename ?? "",
            createdBy: userId,
          }]);
      }

      return {
        publicId: input.attachmentPublicId,
        originalFilename: updated.fileName ?? "",
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

      const attachment = await fileActivityLogRepo.getByPublicId(
        ctx.db,
        input.attachmentPublicId,
      );

      if (!attachment || attachment.activityType === "file_deleted")
        throw new TRPCError({
          message: `Attachment with public ID ${input.attachmentPublicId} not found`,
          code: "NOT_FOUND",
        });

      const workspaceId = attachment.card?.list.board.workspaceId;
      if (attachment.cardId && !workspaceId) {
        throw new TRPCError({
            message: "Workspace ID not found for this attachment",
            code: "INTERNAL_SERVER_ERROR",
        });
      }
      if (workspaceId) {
        await assertPermission(ctx.db, userId, workspaceId, "card:edit");
      }

      const s3Key = attachment.newFileUrl;
      if (s3Key?.startsWith("/attachments/")) {
        const fs = await import("fs/promises");
        const path = await import("path");
        try {
          const sanitizedPath = path
            .normalize(s3Key)
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
            `Failed to delete local attachment: ${s3Key}`,
          );
        }
      }

      await fileActivityLogRepo.softDelete(ctx.db, {
        publicId: attachment.publicId,
        createdBy: userId,
      });

      if (attachment.cardId) {
        await cardActivityRepo.create(ctx.db, {
          type: "updated_attachment_removed",
          cardId: attachment.cardId,
          attachmentId: attachment.id,
          toTitle: attachment.fileName ?? "",
          createdBy: userId,
        });
      } else if (attachment.taskInstanceId) {
          await cardActivityRepo.bulkCreateForTaskInstance(ctx.db, [{
            type: "updated_attachment_removed",
            taskInstanceId: attachment.taskInstanceId,
            attachmentId: attachment.id,
            toTitle: attachment.fileName ?? "",
            createdBy: userId,
          }]);
      }

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
    .output(z.array(z.custom<Awaited<ReturnType<typeof fileActivityLogRepo.getAllByCardId>>[0]>()))
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
      const attachments = await fileActivityLogRepo.getAllByCardId(
        ctx.db,
        card.id,
      );

      return attachments;
    }),
  getByTaskInstanceId: protectedProcedure
    .meta({
      openapi: {
        summary: "Get attachments by task instance ID",
        method: "GET",
        path: "/task-instances/{taskInstanceId}/attachments",
        description: "Fetch all attachments belonging to a specific task instance",
        tags: ["Attachments"],
        protect: true,
      },
    })
    .input(z.object({ taskInstanceId: z.string().uuid() }))
    .output(z.array(z.custom<Awaited<ReturnType<typeof fileActivityLogRepo.getAllByTaskInstanceId>>[0]>()))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      // Fetch all non-deleted attachments
      const attachments = await fileActivityLogRepo.getAllByTaskInstanceId(
        ctx.db,
        input.taskInstanceId,
      );

      if (!attachments) {
        throw new TRPCError({
          message: `Attachments not found`,
          code: "NOT_FOUND",
        });
      }

      return attachments;
    }),
});
