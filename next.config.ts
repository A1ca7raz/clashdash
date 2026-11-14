import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM and data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  webpack(config, { nextRuntime }) {
    // The Edge register() branch returns before loading this Node-only startup module.
    if (nextRuntime === "edge") config.externals.push({ "./instrumentation-node": "commonjs ./instrumentation-node" });
    return config;
  },
};

export default nextConfig;
