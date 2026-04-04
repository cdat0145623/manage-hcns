import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "next-runtime-env";

export function createS3Client() {
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

export async function generateUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn = 3600,
) {
  const client = createS3Client();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      // Don't set ACL for private files
    }),
    { expiresIn },
  );
}

export async function generateDownloadUrl(
  bucket: string,
  key: string,
  expiresIn = 3600,
) {
  const client = createS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn },
  );
}

export async function deleteObject(bucket: string, key: string) {
  const client = createS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

/**
 * Generate presigned URL for an avatar image
 * Returns the URL as-is if it's already a full URL (external provider)
 * Returns presigned URL if it's an S3 key
 * Returns null if image key is missing, bucket is not configured, or URL generation fails
 */
export async function generateAvatarUrl(
  imageKey: string | null | undefined,
  expiresIn = 86400, // 24 hours
): Promise<string | null> {
  if (!imageKey) {
    return null;
  }

  if (imageKey.startsWith("http://") || imageKey.startsWith("https://")) {
    return imageKey;
  }

  const bucket = env("NEXT_PUBLIC_AVATAR_BUCKET_NAME");
  if (!bucket) {
    return null;
  }

  try {
    return await generateDownloadUrl(bucket, imageKey, expiresIn);
  } catch {
    // If URL generation fails, return null
    return null;
  }
}

/**
 * Generate presigned URL for an attachment
 * Returns null if attachment key is missing, bucket is not configured, or URL generation fails
 */
export async function generateAttachmentUrl(
  attachmentKey: string | null | undefined,
  expiresIn = 86400,
): Promise<string | null> {
  if (!attachmentKey) {
    return null;
  }

  if (attachmentKey.startsWith("/attachments/")) {
    return attachmentKey;
  }

  const attachmentsBucket = env("NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME") ?? "attachments";
  if (!attachmentsBucket) {
    return null;
  }

  try {
    return await generateDownloadUrl(attachmentsBucket, attachmentKey, expiresIn);
  } catch {
    // If URL generation fails, return null
    return null;
  }
}

/**
 * Utility to test S3/MinIO connection and URL generation.
 * Run with: npx tsx packages/shared/src/utils/s3.ts
 */
export async function testS3() {
  const bucket = process.env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME ?? "attachments";
  const key = `test-${Date.now()}.txt`;

  console.log("--- S3 Config ---");
  console.log("Endpoint:", process.env.S3_ENDPOINT);
  console.log("Bucket:", bucket);

  try {
    const url = await generateUploadUrl(bucket, key, "text/plain");
    console.log("\n✅ Generated Upload URL:");
    console.log(url);

    if (process.env.NEXT_PUBLIC_KAN_ENV !== "cloud") {
      const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      const proxiedUrl = url.replace(endpoint, `${appUrl}/api/minio`);
      console.log("\n🔗 Proxied URL (via Middleware):");
      console.log(proxiedUrl);
    }
  } catch (error) {
    console.error("\n❌ Failed to generate URL:", error);
  }
}

// Allow running this file directly with tsx to test configuration
if (
  process.argv[1]
    ?.replace(/\\/g, "/")
    .endsWith("packages/shared/src/utils/s3.ts")
) {
  void testS3().catch(console.error);
}
