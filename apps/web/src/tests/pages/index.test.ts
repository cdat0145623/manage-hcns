import { beforeEach, describe, expect, it, vi } from "vitest";

import { getServerSideProps } from "../../pages/index";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<(options: { headers: Headers }) => Promise<unknown>>(),
  initAuth: vi.fn(),
  createDrizzleClient: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@kan/auth/server", () => ({
  initAuth: mocks.initAuth,
}));

vi.mock("@kan/db/client", () => ({
  createDrizzleClient: mocks.createDrizzleClient,
}));

vi.mock("@kan/logger", () => ({
  createLogger: () => ({ error: mocks.error }),
}));

vi.mock("~/components/SessionUnavailable", () => ({
  AuthSessionUnavailableScreen: () => null,
}));

describe("home server-side redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDrizzleClient.mockReturnValue({});
    mocks.initAuth.mockReturnValue({
      api: { getSession: mocks.getSession },
    });
  });

  it("temporarily redirects an authenticated user to reports", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    });

    const result = await getServerSideProps({
      req: { headers: { cookie: "kan_session_token=session-1" } },
    } as never);

    expect(result).toEqual({
      redirect: { destination: "/reports", permanent: false },
    });
    expect(mocks.getSession.mock.calls[0]?.[0]?.headers).toBeInstanceOf(
      Headers,
    );
  });

  it("temporarily redirects an unauthenticated user to login", async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await getServerSideProps({ req: { headers: {} } } as never);

    expect(result).toEqual({
      redirect: { destination: "/login", permanent: false },
    });
  });

  it("returns a retryable 503 instead of treating session failures as logout", async () => {
    const error = new Error("session lookup failed");
    mocks.getSession.mockRejectedValue(error);
    const response = { statusCode: 200 };

    const result = await getServerSideProps({
      req: { headers: {} },
      res: response,
    } as never);

    expect(result).toEqual({
      props: { sessionUnavailable: true },
    });
    expect(response.statusCode).toBe(503);
    expect(mocks.error).toHaveBeenCalledWith(
      { error },
      "Failed to resolve session for home route",
    );
  });
});
