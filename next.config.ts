import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg-boss", "playwright-core", "pino"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
