import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
