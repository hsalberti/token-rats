import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token Rats",
  description: "Strava for AI token burn. Auto-sync your Claude Code + Cursor usage to your friends.",
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
