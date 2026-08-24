import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AuthSessionUnavailableScreen,
  SessionUnavailableBanner,
} from "./SessionUnavailable";

vi.mock("@lingui/core/macro", () => ({
  t: (strings: TemplateStringsArray) => strings[0],
}));

describe("session unavailable UI", () => {
  it("warns an authenticated user without replacing the current screen", () => {
    const markup = renderToStaticMarkup(
      <SessionUnavailableBanner isRetrying={false} onRetry={() => undefined} />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Mất kết nối tới máy chủ");
    expect(markup).toContain("Dữ liệu có thể chưa được cập nhật");
    expect(markup).toContain("Thử lại");
  });

  it("offers retry instead of login when the first session check fails", () => {
    const markup = renderToStaticMarkup(
      <AuthSessionUnavailableScreen
        isRetrying={false}
        onRetry={() => undefined}
      />,
    );

    expect(markup).toContain("Không thể kết nối tới máy chủ");
    expect(markup).toContain("Thử lại");
    expect(markup).not.toContain("Đăng nhập");
  });
});
