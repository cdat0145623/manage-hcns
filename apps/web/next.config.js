import { fileURLToPath } from "url";
import createJiti from "jiti";
import { env } from "next-runtime-env";
import { configureRuntimeEnv } from "next-runtime-env/build/configure.js";

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
createJiti(fileURLToPath(import.meta.url))("./src/env");

configureRuntimeEnv();

/** @type {import("next").NextConfig} */
const config = {
  output:
    env("NEXT_PUBLIC_USE_STANDALONE_OUTPUT") === "true"
      ? "standalone"
      : undefined,
  reactStrictMode: true,

  /** Exclude build tools and dev-only packages from the standalone output */
  outputFileTracingExcludes: {
    "**/*": [
      "@esbuild/**",
      "esbuild/**",
      "typescript/**",
      "webpack/**",
      "uglify-js/**",
      "terser/**",
    ],
  },


  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@kan/api",
    "@kan/db",
    "@kan/shared",
    "@kan/auth",
    "@kan/stripe",
    "@tiptap/pm",
    "@tiptap/core",
    "@tiptap/react",
    "@tiptap/starter-kit",
    "@tiptap/extension-character-count",
    "@tiptap/extension-bubble-menu",
    "@tiptap/extension-floating-menu",
    "@tiptap/extension-highlight",
    "@tiptap/extension-link",
    "@tiptap/extension-mention",
    "@tiptap/extension-placeholder",
    "@tiptap/extension-task-item",
    "@tiptap/extension-task-list",
    "@tiptap/extension-text-align",
    "@tiptap/extension-text-style",
    "@tiptap/extension-typography",
    "@tiptap/extension-underline",
    "@tiptap/suggestion",
    "tiptap-markdown",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },

  // temporarily ignore eslint errors during build until we fix all the errors sigh
  eslint: { ignoreDuringBuilds: true },

  images: {
    remotePatterns: (() => {
      /** @type {Array<{protocol: "http" | "https", hostname: string}>} */
      const patterns = [
        { protocol: "https", hostname: "**" },
        {
          protocol: "http",
          hostname: "localhost",
        },
      ];

      return patterns;
    })(),
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  serverExternalPackages: ["pino"],
  allowedDevOrigins: ["192.168.1.115"],
  experimental: {
    // instrumentationHook: true,
    swcPlugins: [["@lingui/swc-plugin", {}]],
  },

  async rewrites() {
    return [
      {
        source: "/settings",
        destination: "/settings/account",
      },
    ];
  },
};

// Only allow external images when OIDC is configured (for OIDC provider avatars)
if (
  env("OIDC_CLIENT_ID") &&
  env("OIDC_CLIENT_SECRET") &&
  env("OIDC_DISCOVERY_URL")
) {
  config.images?.remotePatterns?.push({
    protocol: "https",
    hostname: "**",
  });
}

export default config;
