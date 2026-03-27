import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "next-runtime-env";

export function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // Proxy to MinIO (Local) or S3 Storage
  const attachmentsBucket = env("NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME") ?? "attachments";
  const avatarBucket = env("NEXT_PUBLIC_AVATAR_BUCKET_NAME") ?? "avatars";

  if (url.pathname.startsWith("/api/minio/")) {
    const storageUrl = env("NEXT_PUBLIC_STORAGE_URL") ?? "http://localhost:9000";
    const base = storageUrl.endsWith("/") ? storageUrl.slice(0, -1) : storageUrl;
    return NextResponse.rewrite(new URL(`${base}${url.pathname.replace("/api/minio", "")}${url.search}`));
  }

  if (
    url.pathname.startsWith(`/${attachmentsBucket}/`) ||
    url.pathname.startsWith(`/${avatarBucket}/`)
  ) {
    const storageUrl = env("NEXT_PUBLIC_STORAGE_URL") ?? "http://localhost:9000";
    // Clean up trailing slash
    const base = storageUrl.endsWith("/") ? storageUrl.slice(0, -1) : storageUrl;
    
    // Redirect bucket requests to MinIO URL
    return NextResponse.rewrite(new URL(`${base}${url.pathname}`));
  }

  if (url.pathname === "/") {
    if (env("NEXT_PUBLIC_KAN_ENV") !== "cloud") {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/api/minio/:path*",
    "/:path*",
  ],
};
