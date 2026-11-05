import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Next's default TS integration does not yet support TypeScript 7, even for route type generation.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
