import type { I18n, MessageDescriptor } from "@lingui/core";
import { z } from "zod";

const AUTH_MESSAGES = {
  anErrorOccurred: {
    id: "Vw8l6h",
    message: "An error occurred",
  },
  invalidCredentials: {
    id: "auth.invalid-credentials",
    message: "Invalid username or password",
  },
  invalidEmail: {
    id: "B2Tpo0",
    message: "Invalid email",
  },
  passwordMinSix: {
    id: "BfZAc7",
    message: "Password must be at least 6 characters",
  },
  passwordMinEight: {
    id: "vwGkYB",
    message: "Password must be at least 8 characters",
  },
  usernameMin: {
    id: "riEdaP",
    message: "Username must be at least 3 characters",
  },
  usernameTaken: {
    id: "auth.username-taken",
    message: "Username already taken",
  },
} satisfies Record<string, MessageDescriptor>;

export interface AuthFormValues {
  name?: string;
  username: string;
  password?: string;
  email?: string;
}

export function createSignUpSchema(i18n: I18n) {
  return z.object({
    name: z.string().optional(),
    username: z.string().min(3, i18n._(AUTH_MESSAGES.usernameMin)),
    password: z.string().min(8, i18n._(AUTH_MESSAGES.passwordMinEight)),
    email: z.string().email(i18n._(AUTH_MESSAGES.invalidEmail)),
  });
}

export function createSignInSchema(i18n: I18n) {
  return z.object({
    username: z.string().min(3, i18n._(AUTH_MESSAGES.usernameMin)),
    password: z.string().min(6, i18n._(AUTH_MESSAGES.passwordMinSix)),
  });
}

export function getAuthErrorMessage(i18n: I18n, message?: string): string {
  switch (message) {
    case "Invalid username or password":
      return i18n._(AUTH_MESSAGES.invalidCredentials);
    case "Username already taken":
      return i18n._(AUTH_MESSAGES.usernameTaken);
    default:
      return i18n._(AUTH_MESSAGES.anErrorOccurred);
  }
}
