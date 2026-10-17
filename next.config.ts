import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@electric-sql/pglite", "openfig-core", "fzstd"],
  experimental: {
    proxyClientMaxBodySize: "64mb",
  },
};

export default nextConfig;
