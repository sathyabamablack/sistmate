import { readFileSync } from "node:fs";

/** @type {import('next').NextConfig} */

/**
 * One id per build: written by scripts/inject-sw-version.mjs (npm "prebuild"), which also
 * hands it to the service worker. Falls back to the git commit on Vercel, else Next's default.
 */
function readBuildId() {
  try {
    const fromFile = readFileSync(new URL("./.build-id", import.meta.url), "utf8").trim();
    if (fromFile) return fromFile;
  } catch {
    /* no prebuild step ran (dev server, or `next build` called directly) */
  }
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || undefined;
}
const BUILD_ID = readBuildId();

/**
 * Where the browser loads /_next/static (JS, CSS, fonts) from. Unset: this site, as usual.
 * scripts/deploy-prod.mjs sets it to a Cloudflare Pages copy of the build's static files, so those
 * requests don't count against the Vercel plan. The files stay on Vercel too.
 */
const ASSET_PREFIX = (process.env.ASSET_PREFIX || "").replace(/\/+$/, "");
const ASSET_ORIGIN = ASSET_PREFIX ? ` ${new URL(ASSET_PREFIX).origin}` : "";

const securityHeaders = [
  // Inline styles/scripts are needed for the theme boot script and Next's runtime.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" +
        ASSET_ORIGIN +
        (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      `style-src 'self' 'unsafe-inline'${ASSET_ORIGIN}`,
      "img-src 'self' data: blob: https:",
      `font-src 'self' data:${ASSET_ORIGIN}`,
      // The service worker fetches (and caches) the static files from the asset host.
      `connect-src 'self'${ASSET_ORIGIN}`,
      "worker-src 'self'",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  ...(BUILD_ID ? { generateBuildId: async () => BUILD_ID, env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID } } : {}),
  // CORS requests for the static files, so the service worker can store them from the asset host.
  ...(ASSET_PREFIX ? { assetPrefix: ASSET_PREFIX, crossOrigin: "anonymous" } : {}),
  // Parallel dev builds (or a running server) can use their own output directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // NEXT_BUILD_CPUS caps build workers; on low-memory Windows machines the
  // default (one per core) can exhaust the page file mid-build.
  experimental: {
    agentUpgrade: "security",
    // Going back to a page seen in the last minute reuses it instead of running the server again.
    // Portal data is cached for 3 minutes on the server anyway; Refresh, sign-in and sign-out all
    // call router.refresh(), which clears this cache.
    staleTimes: { dynamic: 60 },
    ...(process.env.NEXT_BUILD_CPUS ? { cpus: Number(process.env.NEXT_BUILD_CPUS) } : {}),
  },
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@usp/core",
    "@usp/erp-adapter",
    "@usp/lms-adapter",
    "@usp/cache",
  ],
  // cheerio is server-only and large — keep it out of the bundler.
  serverExternalPackages: ["cheerio"],
  async redirects() {
    return [
      // Signed-out visitors get the public overview; a stale cookie still reaches
      // the dashboard layout, which sends it through the expired-session flow.
      {
        source: "/",
        missing: [{ type: "cookie", key: "usp_session" }],
        destination: "/welcome",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      // Both versions of /welcome are static; the edge picks one by the session cookie, so the
      // signed-in call to action ("Open your dashboard") stays without running a function.
      beforeFiles: [
        {
          source: "/welcome",
          has: [{ type: "cookie", key: "usp_session" }],
          destination: "/welcome/member",
        },
      ],
    };
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Written at build time with the build id; a stale copy would pin old caches.
        source: "/sw-version.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // The service worker must always be revalidated so updates ship promptly.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
