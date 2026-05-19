import type { Metadata, Viewport } from "next";
import "./globals.css";

export const runtime = "edge";

export const metadata: Metadata = {
  title: {
    default: "Token Rats",
    template: "%s | Token Rats",
  },
  description:
    "Strava for AI token burn. Auto-sync your Claude Code + Cursor usage to a leaderboard with your crew.",
  metadataBase: new URL("https://tokenrats.com"),
  openGraph: {
    title: "Token Rats",
    description: "Gym rats for token tracking with friends.",
    url: "https://tokenrats.com",
    siteName: "Token Rats",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Token Rats",
    description: "Gym rats for token tracking with friends.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
