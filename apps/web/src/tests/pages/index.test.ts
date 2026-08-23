import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<(options: { headers: Headers }) => Promise<unknown>>(),
  initAuth: vi.fn(),
  createDrizzleClient: vi.fn(),
  error: vi.fn(),
  end: vi.fn(),
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

import { getServerSideProps } from "../../pages/index";

describe("home server-side redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDrizzleClient.mockReturnValue({ $client: { end: mocks.end } });
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
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("temporarily redirects an unauthenticated user to login", async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await getServerSideProps({ req: { headers: {} } } as never);

    expect(result).toEqual({
      redirect: { destination: "/login", permanent: false },
    });
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("logs session failures and fails closed to login", async () => {
    const error = new Error("session lookup failed");
    mocks.getSession.mockRejectedValue(error);

    const result = await getServerSideProps({ req: { headers: {} } } as never);

    expect(result).toEqual({
      redirect: { destination: "/login", permanent: false },
    });
    expect(mocks.error).toHaveBeenCalledWith(
      { error },
      "Failed to resolve session for home route",
    );
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
