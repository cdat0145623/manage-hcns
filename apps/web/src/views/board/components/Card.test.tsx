import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import Card from "./Card";

Object.assign(globalThis, { React });

vi.mock("~/components/Avatar", () => ({ default: () => null }));
vi.mock("~/components/Badge", () => ({ default: () => null }));
vi.mock("~/components/CircularProgress", () => ({ default: () => null }));
vi.mock("~/components/LabelIcon", () => ({ default: () => null }));
vi.mock("~/hooks/useLocalisation", () => ({
  useLocalisation: () => ({ dateLocale: undefined }),
}));
vi.mock("~/utils/helpers", () => ({ getAvatarUrl: () => undefined }));

describe("Card", () => {
  it("uses light and dark green backgrounds when the card is completed", () => {
    const markup = renderToStaticMarkup(
      <Card title="Completed card" description={null} status="done" />,
    );

    expect(markup).toContain("bg-emerald-50");
    expect(markup).toContain("dark:bg-emerald-900/20");
    expect(markup).toContain("dark:hover:bg-emerald-900/30");
    expect(markup).not.toContain("bg-light-50");
    expect(markup).not.toContain("dark:bg-dark-200");
    expect(markup).not.toContain("dark:hover:bg-dark-300");
  });

  it.each(["pending", "missed"] as const)(
    "preserves the default background when the card status is %s",
    (status) => {
      const markup = renderToStaticMarkup(
        <Card title="Active card" description={null} status={status} />,
      );

      expect(markup).toContain("bg-light-50");
      expect(markup).toContain("dark:bg-dark-200");
      expect(markup).toContain("dark:hover:bg-dark-300");
      expect(markup).not.toContain("bg-emerald-50");
    },
  );
});
