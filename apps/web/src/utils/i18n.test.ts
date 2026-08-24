import { describe, expect, it } from "vitest";

import { activateLocale, i18n } from "./i18n";

describe("i18n", () => {
  it("loads Vietnamese messages for the Vietnamese locale", async () => {
    await activateLocale("vi");

    expect(i18n.locale).toBe("vi");
    expect(i18n._({ id: "z0t9bb", message: "Login" })).toBe("Đăng nhập");
  });
});
