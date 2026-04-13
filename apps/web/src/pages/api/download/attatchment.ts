import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { withRateLimit } from "@kan/api/utils/rateLimit";

import { env } from "~/env";

function createS3Client() {
  const credentials =
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined;

  return new S3Client({
    region: process.env.S3_REGION ?? "",
    endpoint: process.env.S3_ENDPOINT ?? "",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials,
  });
}

export default withRateLimit(
  { points: 100, duration: 60 },
  async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const { url, filename, bucket: bucketParam } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ message: "url parameter is required" });
    }

    const downloadFilename =
      typeof filename === "string"
        ? decodeURIComponent(filename)
        : "attachment";

    // Handle local file paths
    if (url.startsWith("/attachments/")) {
      try {
        // Prevent directory traversal attacks
        const sanitizedPath = path
          .normalize(url)
          .replace(/^(\.\.[/\\\\])+/, "");
        if (!sanitizedPath.startsWith("/attachments/")) {
          return res.status(403).json({ message: "Forbidden path" });
        }

        const filePath = path.join(process.cwd(), "public", sanitizedPath);

        // Check if file exists
        await fs.access(filePath);

        // Get file stats
        const stat = await fs.stat(filePath);

        // Ensure it's not a directory
        if (stat.isDirectory()) {
          return res
            .status(400)
            .json({ message: "Cannot download a directory" });
        }

        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${downloadFilename}"; filename*=UTF-8''${downloadFilename}`,
        );
        res.setHeader("Content-Length", stat.size);

        // Try to guess a content type or just use standard
        res.setHeader("Content-Type", "application/octet-stream");

        const stream = createReadStream(filePath);
        stream.pipe(res);
        return;
      } catch (error) {
        console.error("Error reading local attachment:", error);
        return res.status(404).json({ message: "Local file not found" });
      }
    }

    // Handle S3/MinIO keys (e.g., "hxhdpeddoqwl/bsawyfwbfasm/file.jpg")
    const attachmentsBucket =
      (typeof bucketParam === "string" && bucketParam) ||
      env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME ||
      "attachments";

    // If url looks like a key (no protocol), construct S3 URL and fetch with credentials
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      try {
        const s3Endpoint = env.NEXT_PUBLIC_STORAGE_URL;
        if (!s3Endpoint) {
          return res
            .status(500)
            .json({ message: "Storage URL not configured" });
        }

        // Create signed URL for the S3 object
        const client = createS3Client();
        const signedUrl = await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: attachmentsBucket,
            Key: url,
          }),
          { expiresIn: 3600 },
        );

        // Fetch through signed URL
        const upstream = await fetch(signedUrl);

        if (!upstream.ok) {
          console.error(
            "Failed to fetch from S3:",
            upstream.status,
            await upstream.text(),
          );
          return res
            .status(upstream.status)
            .json({ message: "Failed to fetch attachment from storage" });
        }

        const contentType =
          upstream.headers.get("Content-Type") ?? "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${downloadFilename}"; filename*=UTF-8''${downloadFilename}`,
        );

        // Convert web stream to buffer and send (Next.js standalone doesn't support pipe)
        const buffer = await upstream.arrayBuffer();
        return res.send(Buffer.from(buffer));
      } catch (error) {
        console.error("Error fetching from S3:", error);
        return res
          .status(500)
          .json({ message: "Failed to download attachment" });
      }
    }

    // Existing external S3 URL logic (for backwards compatibility)
    const s3Endpoint = env.S3_ENDPOINT;

    if (s3Endpoint) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL" });
      }

      const hostname = parsed.hostname.toLowerCase();
      let allowedHost: string;
      try {
        allowedHost = new URL(s3Endpoint).hostname.toLowerCase();
      } catch {
        return res
          .status(500)
          .json({ message: "Storage endpoint misconfigured" });
      }

      if (hostname !== allowedHost && !hostname.endsWith(`.${allowedHost}`)) {
        return res.status(403).json({ message: "URL not allowed" });
      }
    }

    try {
      const upstream = await fetch(url);

      if (!upstream.ok) {
        return res
          .status(upstream.status)
          .json({ message: "Failed to fetch attachment" });
      }

      const contentType =
        upstream.headers.get("Content-Type") ?? "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${downloadFilename}"; filename*=UTF-8''${downloadFilename}`,
      );

      const buffer = await upstream.arrayBuffer();
      return res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Error downloading attachment:", error);
      return res.status(500).json({ message: "Failed to download attachment" });
    }
  },
);
