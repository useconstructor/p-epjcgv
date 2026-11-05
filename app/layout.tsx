import type { Metadata } from "next";
import localFont from "next/font/local";
import { branding, semantic } from "@/lib/branding";
import { Header, Footer } from "@/components/shell";
import "./globals.css";
import fontAssets from "@/lib/font-assets.json";
const serif = localFont({
  src: [
    { path: "../public/fonts/Source-Serif-4-400.ttf", weight: "400" },
    { path: "../public/fonts/Source-Serif-4-500.ttf", weight: "500" },
    { path: "../public/fonts/Source-Serif-4-600.ttf", weight: "600" },
    { path: "../public/fonts/Source-Serif-4-700.ttf", weight: "700" },
  ],
  display: "swap",
  preload: true,
});
const sans = localFont({
  src: [
    { path: "../public/fonts/Source-Sans-3-400.ttf", weight: "400" },
    { path: "../public/fonts/Source-Sans-3-500.ttf", weight: "500" },
    { path: "../public/fonts/Source-Sans-3-600.ttf", weight: "600" },
    { path: "../public/fonts/Source-Sans-3-700.ttf", weight: "700" },
  ],
  display: "swap",
  preload: true,
});
export const metadata: Metadata = {
  title: { default: branding.logoText, template: `%s · ${branding.logoText}` },
  description:
    "Un cuaderno personal para organizar tus lecturas y recordar tus valoraciones.",
  icons: { icon: "/icon.svg", apple: "/brand-mark.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const faces = branding.brandbook.fontFaces
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;font-display:swap;src:url('${(fontAssets as Record<string, string>)[f.url] || f.url}') format('truetype');}`,
    )
    .join("");
  const tokens = {
    "--brand-background": branding.backgroundColor,
    "--brand-surface": branding.secondaryColor,
    "--brand-primary": branding.primaryColor,
    "--brand-accent": branding.accentColor,
    "--brand-text": branding.textColor,
    "--brand-muted": semantic.muted,
    "--brand-success": semantic.success,
    "--brand-font-heading": `'${branding.fontHeading}', Georgia, serif`,
    "--brand-font-body": `'${branding.fontBody}', sans-serif`,
  };
  return (
    <html lang="es" data-scroll-behavior="smooth" style={tokens as React.CSSProperties}>
      <head>
        <style>{faces}</style>
      </head>
      <body className={`${serif.className} ${sans.className}`}>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <Header />
        {children}
        <Footer />
        {process.env.NEXT_PUBLIC_CONSTRUCTOR_API &&
          process.env.NEXT_PUBLIC_PROJECT_ID && (
            <script src={"https://constructor-api-git-fix-two-projects-ai-p-5c3f22-useconstructor.vercel.app/v1/projects/P-EPJCGV/analytics/script.js"} defer></script>
          )}
      <script src="/constructor-editor.js" defer></script></body>
    </html>
  );
}
