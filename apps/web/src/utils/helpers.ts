import { env } from "~/env";

export const formatToArray = (
  value: string | string[] | undefined,
): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined);
  }
  return value ? [value] : [];
};

export const inferInitialsFromEmail = (email: string) => {
  const localPart = email.split("@")[0];
  if (!localPart) return "";
  const separators = /[._-]/;
  const parts = localPart.split(separators);

  if (parts.length > 1) {
    return (
      (parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")
    ).toUpperCase();
  } else {
    return localPart.slice(0, 2).toUpperCase();
  }
};

export const getInitialsFromName = (name: string) => {
  return name
    .split(" ")
    .map((namePart) => namePart.charAt(0).toUpperCase())
    .join("");
};

export const formatMemberDisplayName = (
  name: string | null,
  email: string | null,
) => {
  if (name) return name;
  if (!email) return "";

  const localPart = email.split("@")[0];

  if (!localPart) return "";

  return localPart.replace(/[_-]/g, ".");
};

export const getAvatarUrl = (imageOrKey: string | null | undefined) => {
  if (!imageOrKey) return "";

  if (imageOrKey.startsWith("http://") || imageOrKey.startsWith("https://")) {
    return imageOrKey;
  }

  const avatarBucket = env.NEXT_PUBLIC_AVATAR_BUCKET_NAME ?? "images";
  return `/${avatarBucket}/${imageOrKey}`;
};

export const getAttachmentUrl = (
  key: string | null | undefined,
  contentType?: string | null,
) => {
  if (!key) return "";

  if (
    key.startsWith("http://") ||
    key.startsWith("https://") ||
    key.startsWith("/")
  ) {
    return key;
  }

  // Use download endpoint to proxy through server (for MinIO/S3 access)
  const bucket = env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME ?? "attachments";
  const encodedKey = encodeURIComponent(key);
  const filename = key.split("/").pop() ?? "attachment";
  const encodedFilename = encodeURIComponent(filename);
  return `/api/download/attatchment?url=${encodedKey}&filename=${encodedFilename}&bucket=${bucket}`;
};

export const fixServerDate = (date: Date | string | number) => {
  const d = new Date(date);
  const now = new Date();

  // If the date is more than 30 minutes in the future, it's almost certainly the timezone shift bug
  // We subtract 7 hours (25200000 ms) to restore it to the correct local time
  if (d.getTime() - now.getTime() > 30 * 60 * 1000) {
    return new Date(d.getTime() - 7 * 60 * 60 * 1000);
  }

  return d;
};
