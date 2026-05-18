import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not Found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="text-center">
        <p className="text-8xl font-black text-rat-700">404</p>
        <h1 className="mt-4 text-3xl font-black">Page not found</h1>
        <p className="mt-2 text-zinc-400">
          This rat scurried away. Check the URL or go back home.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-lg bg-rat-500 px-6 py-3 font-bold text-white transition-colors hover:bg-rat-600"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
