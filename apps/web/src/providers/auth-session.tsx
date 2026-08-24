import type { ReactNode } from "react";
import React, { createContext, useContext, useRef } from "react";

import { authClient } from "@kan/auth/client";

export type AuthSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

interface ResolveAuthSessionStateInput<Session> {
  currentSession: Session | null;
  lastAuthenticatedSession: Session | null;
  isPending: boolean;
  error: unknown;
}

interface ResolvedAuthSessionState<Session> {
  status: AuthSessionStatus;
  session: Session | null;
}

type AuthSession = typeof authClient.$Infer.Session;

interface AuthSessionContextValue {
  session: AuthSession | null;
  status: AuthSessionStatus;
  error: unknown;
  isRetrying: boolean;
  retrySession: () => Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(
  undefined,
);

export function resolveAuthSessionState<Session>(
  input: ResolveAuthSessionStateInput<Session>,
): ResolvedAuthSessionState<Session> {
  if (input.currentSession && !input.error) {
    return { status: "authenticated", session: input.currentSession };
  }

  if (
    input.error &&
    typeof input.error === "object" &&
    "status" in input.error &&
    input.error.status === 401
  ) {
    return { status: "unauthenticated", session: null };
  }

  if (input.error) {
    return {
      status: "unavailable",
      session: input.lastAuthenticatedSession,
    };
  }

  if (input.isPending) {
    return { status: "loading", session: null };
  }

  return { status: "unauthenticated", session: null };
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const { data, error, isPending, isRefetching, refetch } =
    authClient.useSession();
  const lastAuthenticatedSession = useRef<AuthSession | null>(null);

  if (data && !error) {
    lastAuthenticatedSession.current = data;
  }

  const resolvedState = resolveAuthSessionState({
    currentSession: data,
    lastAuthenticatedSession: lastAuthenticatedSession.current,
    isPending,
    error,
  });

  if (resolvedState.status === "unauthenticated") {
    lastAuthenticatedSession.current = null;
  }

  return (
    <AuthSessionContext.Provider
      value={{
        session: resolvedState.session,
        status: resolvedState.status,
        error,
        isRetrying: isRefetching,
        retrySession: refetch,
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }

  return context;
}
