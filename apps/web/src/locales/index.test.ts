import { describe, expect, it } from "vitest";

import { resolveInitialLocale } from "./index";

describe("resolveInitialLocale", () => {
  it.each(["vi", "en"] as const)(
    "keeps the supported %s locale",
    (locale) => {
      expect(resolveInitialLocale(locale)).toBe(locale);
    },
  );

  it.each([null, "", "fr", "ptbr", "invalid"])(
    "falls back to Vietnamese for unsupported locale %s",
    (locale) => {
      expect(resolveInitialLocale(locale)).toBe("vi");
    },
  );
});
