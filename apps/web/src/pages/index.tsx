import type { GetServerSideProps } from "next";

import { initAuth } from "@kan/auth/server";
import { createDrizzleClient } from "@kan/db/client";
import { createLogger } from "@kan/logger";

import { AuthSessionUnavailableScreen } from "~/components/SessionUnavailable";

const logger = createLogger("home-route");

interface HomeProps {
  sessionUnavailable?: boolean;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const db = createDrizzleClient();
  const headers = new Headers();

  for (const [name, value] of Object.entries(context.req.headers)) {
    if (value !== undefined) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  try {
    const auth = initAuth(db);
    const session = await auth.api.getSession({ headers });

    return {
      redirect: {
        destination: session?.user ? "/reports" : "/login",
        permanent: false,
      },
    };
  } catch (error) {
    logger.error({ error }, "Failed to resolve session for home route");
    context.res.statusCode = 503;

    return {
      props: { sessionUnavailable: true },
    };
  }
};

export default function Home({ sessionUnavailable }: HomeProps) {
  if (sessionUnavailable) {
    return (
      <AuthSessionUnavailableScreen
        isRetrying={false}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return null;
}
