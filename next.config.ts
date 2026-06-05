import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack ignores stray lockfiles higher up
  // the directory tree (e.g. ~/package-lock.json) when inferring the root.
  turbopack: {
    root: __dirname
  }
};

export default nextConfig;
