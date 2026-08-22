import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { generateUploadUrl } from "@kan/shared/utils";

import { attachmentRouter } from "./attachment";

vi.mock("@kan/db/repository/card.repo", () => ({
  getWorkspaceAndCardIdByCardPublicId: vi.fn(),
}));

vi.mock("@kan/db/repository/workspace.repo", () => ({
  getById: vi.fn(),
}));

vi.mock("@kan/shared/utils", () => ({
  generateUID: vi.fn(() => "file-public-id"),
  generateUploadUrl: vi.fn(),
}));

vi.mock("../utils/permissions", () => ({
  assertPermission: vi.fn(),
}));

describe("attachment router upload URL", () => {
  const storageEndpoint =
    "https://project-ref.storage.supabase.co/storage/v1/s3";
  const signedUploadUrl = `${storageEndpoint}/kanbn-files/workspace/card/file.pdf?X-Amz-Signature=signed`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("S3_ENDPOINT", storageEndpoint);
    vi.stubEnv("NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME", "kanbn-files");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_KAN_ENV;

    vi.mocked(cardRepo.getWorkspaceAndCardIdByCardPublicId).mockResolvedValue({
      id: 1,
      createdBy: null,
      workspaceId: 2,
      workspaceVisibility: "private",
      listName: "List",
      boardPublicId: "board-public-id",
      boardName: "Board",
    });
    vi.mocked(workspaceRepo.getById).mockResolvedValue({
      publicId: "workspace-public-id",
    } as Awaited<ReturnType<typeof workspaceRepo.getById>>);
    vi.mocked(generateUploadUrl).mockResolvedValue(signedUploadUrl);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps a Supabase presigned upload URL unchanged", async () => {
    const caller = attachmentRouter.createCaller({
      user: { id: "user-id" },
      db: {},
    } as never);

    const result = await caller.generateUploadUrl({
      cardPublicId: "card-public-id",
      filename: "file.pdf",
      contentType: "application/pdf",
      size: 1024,
    });

    expect(result.url).toBe(signedUploadUrl);
  });

  it("proxies a local MinIO presigned upload URL through the app", async () => {
    const localEndpoint = "http://s3.localtest.me:9000";
    const localSignedUrl = `${localEndpoint}/kanbn-files/workspace/card/file.pdf?X-Amz-Signature=signed`;
    vi.stubEnv("S3_ENDPOINT", localEndpoint);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://kan.localtest.me:3000");
    vi.mocked(generateUploadUrl).mockResolvedValue(localSignedUrl);

    const caller = attachmentRouter.createCaller({
      user: { id: "user-id" },
      db: {},
    } as never);

    const result = await caller.generateUploadUrl({
      cardPublicId: "card-public-id",
      filename: "file.pdf",
      contentType: "application/pdf",
      size: 1024,
    });

    expect(result.url).toBe(
      "http://kan.localtest.me:3000/api/minio/kanbn-files/workspace/card/file.pdf?X-Amz-Signature=signed",
    );
  });
});
