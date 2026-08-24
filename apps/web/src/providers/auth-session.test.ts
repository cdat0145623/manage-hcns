import { describe, expect, it } from "vitest";

import { resolveAuthSessionState } from "./auth-session";

const authenticatedSession = {
  user: { id: "user-1" },
  session: { id: "session-1" },
};

describe("resolveAuthSessionState", () => {
  it("returns the current authenticated session after a successful response", () => {
    const state = resolveAuthSessionState({
      currentSession: authenticatedSession,
      lastAuthenticatedSession: null,
      isPending: false,
      error: null,
    });

    expect(state).toEqual({
      status: "authenticated",
      session: authenticatedSession,
    });
  });

  it("keeps the last authenticated session when session verification fails", () => {
    const state = resolveAuthSessionState({
      currentSession: null,
      lastAuthenticatedSession: authenticatedSession,
      isPending: false,
      error: new Error("database unavailable"),
    });

    expect(state).toEqual({
      status: "unavailable",
      session: authenticatedSession,
    });
  });

  it("clears the cached session after an explicit unauthorized response", () => {
    const state = resolveAuthSessionState({
      currentSession: null,
      lastAuthenticatedSession: authenticatedSession,
      isPending: false,
      error: { status: 401, statusText: "Unauthorized" },
    });

    expect(state).toEqual({ status: "unauthenticated", session: null });
  });

  it("preserves the cached session for non-authentication HTTP errors", () => {
    const state = resolveAuthSessionState({
      currentSession: null,
      lastAuthenticatedSession: authenticatedSession,
      isPending: false,
      error: { status: 429, statusText: "Too Many Requests" },
    });

    expect(state).toEqual({
      status: "unavailable",
      session: authenticatedSession,
    });
  });

  it("does not treat an initial session verification failure as logged out", () => {
    const state = resolveAuthSessionState({
      currentSession: null,
      lastAuthenticatedSession: null,
      isPending: false,
      error: new Error("database unavailable"),
    });

    expect(state).toEqual({ status: "unavailable", session: null });
  });

  it("returns unauthenticated only after a successful empty response", () => {
    const state = resolveAuthSessionState({
      currentSession: null,
      lastAuthenticatedSession: authenticatedSession,
      isPending: false,
      error: null,
    });

    expect(state).toEqual({ status: "unauthenticated", session: null });
  });

  it("keeps the loading screen before the initial response resolves", () => {
    const state = resolveAuthSessionState({
      currentSession: null,
      lastAuthenticatedSession: null,
      isPending: true,
      error: null,
    });

    expect(state).toEqual({ status: "loading", session: null });
  });
});
