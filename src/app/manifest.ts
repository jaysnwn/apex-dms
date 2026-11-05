import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "APEX DMS",
    short_name: "APEX",
    description: "APEX TRADING CO. distribution app",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#111a2e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
