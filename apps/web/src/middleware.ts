import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "next-runtime-env";

import { env as env_config } from "~/env";

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // Handle Proxy to MinIO (Local) or S3 Storage
  if (url.pathname.startsWith("/api/minio/")) {
    const path = url.pathname.replace("/api/minio/", "").split("/");
    return proxyToMinio(request, path);
  }

  const attachmentsBucket =
    env("NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME") ?? "attachments";
  const avatarBucket = env("NEXT_PUBLIC_AVATAR_BUCKET_NAME") ?? "images";

  if (
    url.pathname.startsWith(`/${attachmentsBucket}/`) ||
    url.pathname.startsWith(`/${avatarBucket}/`)
  ) {
    const path = url.pathname.slice(1).split("/"); // Bo dau / dau tien roi split
    return proxyToMinio(request, path);
  }

  const response = NextResponse.next();
  const configuredAncestors = (env_config.ALLOWED_FRAME_ANCESTORS ?? "")
    .replace(/,/g, " ") // Chuyen dau phay thanh dau cach
    .replace(/\s+/g, " ") // Don dep dau cach du thua
    .trim()
    .split(" ")
    .filter(Boolean);
  const ancestors = [
    "'self'",
    ...configuredAncestors.filter((ancestor) => ancestor !== "'self'"),
  ].join(" ");
  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${ancestors}`,
  );

  return response;
}

async function proxyToMinio(request: NextRequest, path: string[]) {
  const storageUrl = env("NEXT_PUBLIC_STORAGE_URL") ?? "http://localhost:9000";
  const base = storageUrl.endsWith("/") ? storageUrl.slice(0, -1) : storageUrl;
  const targetUrl = `${base}/${path.join("/")}${request.nextUrl.search}`;

  // Forward tất cả headers, bỏ host
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") {
      headers.set(key, value);
    }
  });

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body:
      request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
    // @ts-ignore - cần cho streaming body
    duplex: "half",
  });

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const config = {
  matcher: ["/", "/api/minio/:path*", "/:path*"],
};
