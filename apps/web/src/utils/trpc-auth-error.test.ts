import { describe, expect, it } from "vitest";

import { isUnauthenticatedTRPCError } from "./trpc-auth-error";

describe("isUnauthenticatedTRPCError", () => {
  it("recognizes the structured tRPC unauthorized code", () => {
    expect(
      isUnauthenticatedTRPCError({
        message: "Authentication required",
        data: { code: "UNAUTHORIZED" },
      }),
    ).toBe(true);
  });

  it("does not redirect for an internal server error", () => {
    expect(
      isUnauthenticatedTRPCError({
        message: "INTERNAL_SERVER_ERROR",
        data: { code: "INTERNAL_SERVER_ERROR" },
      }),
    ).toBe(false);
  });

  it("does not infer logout from an error message", () => {
    expect(isUnauthenticatedTRPCError({ message: "UNAUTHORIZED" })).toBe(false);
  });
});
