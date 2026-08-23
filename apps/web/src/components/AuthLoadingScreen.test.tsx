import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock("@lingui/core/macro", () => ({
  t: (strings: TemplateStringsArray) => strings[0],
}));

vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
  },
  useReducedMotion: () => motionState.reducedMotion,
}));

import { AuthLoadingScreen } from "./AuthLoadingScreen";

describe("AuthLoadingScreen", () => {
  beforeEach(() => {
    motionState.reducedMotion = false;
  });

  it("renders the approved loading message with status semantics", () => {
    const markup = renderToStaticMarkup(<AuthLoadingScreen />);

    expect(markup).toContain("Chuẩn bị không gian làm việc");
    expect(markup).not.toContain("Đang kiểm tra phiên đăng nhập");
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("hides animated characters from screen readers", () => {
    const markup = renderToStaticMarkup(<AuthLoadingScreen />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("sr-only");
  });

  it("renders the message without animated characters for reduced motion", () => {
    motionState.reducedMotion = true;

    const markup = renderToStaticMarkup(<AuthLoadingScreen />);

    expect(markup).toContain("Chuẩn bị không gian làm việc");
    expect(markup).not.toContain('aria-hidden="true"');
  });
});
