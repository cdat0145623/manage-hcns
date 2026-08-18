import { describe, expect, it } from "vitest";

import { classifyTaskInstanceUpdateError } from "./task-instance-update-error";

describe("classifyTaskInstanceUpdateError", () => {
  it.each([
    ["FORBIDDEN", "forbidden"],
    ["BAD_REQUEST", "invalid-transition"],
    ["CONFLICT", "conflict"],
  ] as const)("maps %s to %s", (code, expected) => {
    expect(classifyTaskInstanceUpdateError({ data: { code } })).toBe(expected);
  });

  it("recognizes duplicate update errors without exposing their raw message", () => {
    expect(
      classifyTaskInstanceUpdateError({
        message: "duplicate key value violates unique constraint",
      }),
    ).toBe("conflict");
  });

  it("falls back safely for an unknown error", () => {
    expect(
      classifyTaskInstanceUpdateError(new Error("database unavailable")),
    ).toBe("unknown");
  });
});
