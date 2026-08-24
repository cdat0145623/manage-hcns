import { describe, expect, it } from "vitest";

import {
  createSignUpSchema,
  getAuthErrorMessage,
} from "./auth-form-i18n";
import { activateLocale, i18n } from "~/utils/i18n";

describe("authentication localisation", () => {
  it("uses the active locale for sign-up password validation", async () => {
    await activateLocale("vi");

    const result = createSignUpSchema(i18n).safeParse({
      name: "Nguyen Van A",
      email: "a@example.com",
      username: "nguyena",
      password: "1234567",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Mật khẩu phải có ít nhất 8 ký tự.",
      );
    }
  });

  it("localises known authentication errors and hides unknown backend text", async () => {
    await activateLocale("vi");

    expect(getAuthErrorMessage(i18n, "Invalid username or password")).toBe(
      "Tên đăng nhập hoặc mật khẩu không đúng.",
    );
    expect(getAuthErrorMessage(i18n, "Unexpected upstream error")).toBe(
      "Đã xảy ra lỗi.",
    );
  });

  it("keeps authentication validation and errors in English", async () => {
    await activateLocale("en");

    const result = createSignUpSchema(i18n).safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      username: "janedoe",
      password: "1234567",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Password must be at least 8 characters",
      );
    }
    expect(getAuthErrorMessage(i18n, "Invalid username or password")).toBe(
      "Invalid username or password",
    );
  });
});
