import type { MetadataRoute } from "next";

/** Lets people add Mandala to their home screen, like a daily ritual app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mandala",
    short_name: "Mandala",
    description: "A calm daily mandala to colour.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f2ea",
    theme_color: "#f6f2ea",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
