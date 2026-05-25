import type { Metadata } from "next";
import { PrivacyFooter } from "../../../components/PrivacyFooter";
import { UserMenu } from "../../../components/UserMenu";
import { Wordmark } from "../../../components/ui/Wordmark.js";
import { api } from "../../../lib/api";
import { getCookieHeader, requireSession } from "../../../lib/auth";
import { getServerLocale } from "../../../lib/server-locale";
import { DevicesClient } from "./DevicesClient";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Your devices",
};

export default async function DevicesPage() {
  const user = await requireSession();
  const cookieHeader = await getCookieHeader();
  const locale = await getServerLocale();
  const initial = await api.getMeDevices(cookieHeader).catch(() => ({ devices: [] }));

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="relative z-40 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/app">
            <Wordmark size="md" />
          </a>
          <UserMenu user={user} locale={locale} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <a href="/app" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Dashboard
          </a>
          <h1 className="mt-2 text-2xl font-bold text-zinc-100">Your devices</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Each Token Rats CLI install on a computer of yours is one device. Server stores only an
            anonymous id, last-seen times, upload counts, and the CLI version — never your hostname
            or OS. Disconnect a device to stop accepting new uploads from it.
          </p>
        </div>
        <DevicesClient initial={initial.devices} />
      </main>
      <PrivacyFooter />
    </div>
  );
}
