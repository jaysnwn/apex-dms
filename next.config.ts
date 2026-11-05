import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating "N" dev badge; it sat on top of the sidebar's sign-out button.
  devIndicators: false,
  // PDF rendering runs on the server in Node; keep the library out of the bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // Excel imports
  },
};

export default nextConfig;
