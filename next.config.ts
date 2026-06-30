import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_E2E_FAST === "1" ? ".next-e2e" : ".next",
  trailingSlash: true,
};

export default nextConfig;
