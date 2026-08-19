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

// The comparison bench renders as a complete document with its own theme and scripts,
// and the admin page embeds it in a same origin frame. The site wide policy above
// forbids that, correctly, so the exception is scoped to the one subtree that needs it
// and narrowed to 'self' rather than removed.
//
// This weakens nothing that ships. Every /admin route refuses to render outside
// development and outside localhost, on the server, before touching the disk. In a
// production build the subtree does not exist, so these headers apply to a 404.
const adminFrameHeaders = securityHeaders.map((header) => {
  if (header.key === "Content-Security-Policy") {
    return { key: header.key, value: "frame-ancestors 'self';" };
  }
  if (header.key === "X-Frame-Options") return { key: header.key, value: "SAMEORIGIN" };
  return header;
});

const nextConfig: NextConfig = {
  agentRules: false,
  distDir: process.env.NEXT_E2E_FAST === "1" ? ".next-e2e" : ".next",
  trailingSlash: true,
  poweredByHeader: false,
  async headers() {
    // Both rules would otherwise match an admin path and the broader one wins, so the
    // site wide rule excludes the subtree by negative lookahead rather than relying on
    // ordering.
    return [
      { source: "/admin/:path*", headers: adminFrameHeaders },
      { source: "/((?!admin).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
