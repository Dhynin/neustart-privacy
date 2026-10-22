import type { Metadata, Viewport } from "next";
import { persona } from "@/persona.config.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: `${persona.appName} – ${persona.name}`,
  description: persona.intro,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#151413" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ ["--accent" as string]: persona.accent }}>{children}</body>
    </html>
  );
}
