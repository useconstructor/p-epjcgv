import type { MetadataRoute } from "next";
import { branding } from "@/lib/branding";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: branding.logoText,
    short_name: branding.logoText,
    start_url: "/",
    display: "standalone",
    background_color: branding.backgroundColor,
    theme_color: branding.primaryColor,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
