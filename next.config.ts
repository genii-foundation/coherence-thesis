import type { NextConfig } from "next";

// Applied to every response. frame-ancestors 'none' blocks the clickjacking
// path to the one-click account-deletion control; the rest are standard
// hardening a security scan expects.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none';",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_E2E_FAST === "1" ? ".next-e2e" : ".next",
  trailingSlash: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
