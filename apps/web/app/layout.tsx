import type { Metadata, Viewport } from "next";
import { Footer } from "../components/ui/Footer.js";
import { getServerLocale } from "../lib/server-locale";
import "./globals.css";

export const runtime = "edge";

export const metadata: Metadata = {
  title: {
    default: "Token Rats",
    template: "%s | Token Rats",
  },
  description:
    "Keep a history of your agent setups, try your friends’ configurations, and track local AI usage.",
  metadataBase: new URL("https://tokenrats.com"),
  openGraph: {
    title: "Token Rats",
    description: "Save setups. Try a version. Keep the history.",
    url: "https://tokenrats.com",
    siteName: "Token Rats",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Token Rats",
    description: "Save setups. Try a version. Keep the history.",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    // Served from /public so Cloudflare Pages doesn't classify them as
    // dynamic edge routes (PNGs can't export `runtime = "edge"`).
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Token Rats",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale();
  return (
    <html lang={locale} className="dark">
      <body className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 antialiased">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
