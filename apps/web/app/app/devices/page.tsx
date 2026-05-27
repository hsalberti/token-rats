import type { Metadata } from "next";
import { AuthedTopBar } from "../../../components/AuthedTopBar";
import { PrivacyFooter } from "../../../components/PrivacyFooter";
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
      <AuthedTopBar user={user} locale={locale} />
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
