import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Token Rats",
    template: "%s | Token Rats",
  },
  description:
    "Strava for AI token burn. Auto-sync your Claude Code + Cursor usage to a leaderboard with your crew.",
  metadataBase: new URL("https://tokenrats.dev"),
  openGraph: {
    title: "Token Rats",
    description: "Gym rats for token tracking with friends.",
    url: "https://tokenrats.dev",
    siteName: "Token Rats",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Token Rats",
    description: "Gym rats for token tracking with friends.",
  },
  manifest: "/manifest.webmanifest",
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
