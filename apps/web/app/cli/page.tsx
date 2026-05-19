import type { Metadata } from "next";
import { Wordmark } from "../../components/ui/Wordmark.js";
import { requireSession } from "../../lib/auth";
import { CliApprovalClient } from "./CliApprovalClient";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Approve CLI",
  description: "Approve a Token Rats CLI device code.",
};

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function CliPage({ searchParams }: Props) {
  const user = await requireSession();
  const { code } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <a href="/">
            <Wordmark size="lg" />
          </a>
        </div>

        <CliApprovalClient user={user} initialCode={code ?? ""} />
      </div>
    </div>
  );
}
