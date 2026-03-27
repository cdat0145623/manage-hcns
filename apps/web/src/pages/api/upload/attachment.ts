import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import fs from "fs/promises";
import type { Files } from "formidable";
import { formidable } from "formidable";

import { createNextApiContext } from "@kan/api/trpc";
import { assertPermission } from "@kan/api/utils/permissions";
import { withRateLimit } from "@kan/api/utils/rateLimit";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as cardAttachmentRepo from "@kan/db/repository/cardAttachment.repo";
import { generateUID } from "@kan/shared/utils";

// 50MB
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: false , 
  },    
};

const uploadDir = path.join(process.cwd(), "public", "attachments");

export default withRateLimit(
  { points: 100, duration: 60 },
  async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== "POST") {      
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const { user, db } = await createNextApiContext(req);

      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const cardPublicId = req.query.cardPublicId;
      if (typeof cardPublicId !== "string" || cardPublicId.length < 12) {
        return res.status(400).json({ error: "Invalid cardPublicId" });
      }

      // Check if user has permission to edit the card
      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        db,
        cardPublicId,
      );

      if (!card) {
        return res.status(404).json({ error: "Card not found" });
      }

      try {
        await assertPermission(db, user.id, card.workspaceId, "card:edit");
      } catch {
        return res.status(403).json({ error: "Permission denied" });
      }

      // Ensure upload directory exists
      await fs.mkdir(uploadDir, { recursive: true });

      const form = formidable({
        maxFileSize: MAX_SIZE_BYTES,
        keepExtensions: true,
        uploadDir: uploadDir,
      });

      const files = await new Promise<Files>((resolve, reject) => {
        form.parse(req, (err, _fields, files) => {
          if (err) reject(err instanceof Error ? err : new Error(String(err)));
          else resolve(files);
        });
      });

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const originalFilename = file.originalFilename ?? "file";
      const sanitizedFilename = originalFilename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 200);

      // Generate a unique filename to prevent collisions in public/attachments
      const uniqueFilename = `${generateUID()}-${sanitizedFilename}`;
      const newPath = path.join(uploadDir, uniqueFilename);
      
      // Rename file to the intended path
      await fs.rename(file.filepath, newPath);

      // We'll store the relative path for the frontend to access via standard Next.js static serving
      // Next.js serves from 'public' directory at root '/'
      const relativePath = `/attachments/${uniqueFilename}`;

      const contentType = file.mimetype ?? "application/octet-stream";
      const contentLength = file.size;

      // Create attachment record and log activity
      const attachment = await cardAttachmentRepo.create(db, {
        cardId: card.id,
        filename: uniqueFilename, // Storing physical filename here
        originalFilename: originalFilename,
        contentType,
        size: contentLength,
        s3Key: relativePath, // Reusing s3Key column for local relative path
        createdBy: user.id,
      });

      if (!attachment) {
        // Cleanup if db fails
        await fs.unlink(newPath).catch((e) => {
          console.error("Cleanup failed", e);
        });
        return res.status(500).json({ error: "Failed to create attachment in DB" });
      }

      await cardActivityRepo.create(db, {
        type: "card.updated.attachment.added",
        cardId: card.id,
        attachmentId: attachment.id,
        toTitle: originalFilename,
        createdBy: user.id,
      });

      return res.status(200).json({ attachment });
    } catch (error) {
      console.error("Attachment upload failed", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
