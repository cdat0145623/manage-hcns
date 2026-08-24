import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const vietnameseCatalogPath = resolve(
  process.cwd(),
  "src/locales/vi/messages.json",
);

const requiredAuthMessages = [
  "Login | kan.bn",
  "Welcome back",
  "Enter your username",
  "Enter your password",
  "Login",
  "Don't have an account? <0><1>Sign up</1></0>",
  "Sign up | kan.bn",
  "Sign up disabled",
  "Sign up is currently disabled. Please try again later.",
  "Get started",
  "Enter your name",
  "Enter your email",
  "Sign up",
  "Already have an account? <0><1>Sign in</1></0>",
  "Username must be at least 3 characters",
  "Password must be at least 6 characters",
  "Password must be at least 8 characters",
  "Invalid email",
  "Success",
  "You have been logged in successfully.",
  "You have been signed up successfully.",
  "An error occurred",
  "Invalid username or password",
  "Username already taken",
];

describe("Vietnamese authentication catalogue", () => {
  it("contains every required authentication message", () => {
    expect(existsSync(vietnameseCatalogPath)).toBe(true);

    const catalog = JSON.parse(readFileSync(vietnameseCatalogPath, "utf8")) as Record<
      string,
      { message: string; translation: string }
    >;
    const translatedMessages = new Map(
      Object.values(catalog).map(({ message, translation }) => [
        message,
        translation,
      ]),
    );

    for (const message of requiredAuthMessages) {
      expect(translatedMessages.get(message)).toMatch(/\S/);
    }
  });
});
