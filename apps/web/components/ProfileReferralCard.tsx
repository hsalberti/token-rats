"use client";

// Server component would crash on the owner branch: the <input onFocus=…>
// handler can't cross the RSC boundary. In prod that surfaces as the opaque
// "An error occurred in the Server Components render" — and only fires when
// the user views their own profile (referralCode is owner-only).

import { CopyButton } from "./CopyButton";
import { Card } from "./ui/Card";

interface Props {
  /** Number of users this profile has brought in via their referral link. */
  count: number;
  /** Self-only: the owner's referral code, used to build a copy-able link. */
  referralCode?: string;
  /** Origin used to build the share link, computed server-side for SSR/CSR parity. */
  origin: string;
  /** Display handle — used in the empty-state copy. */
  handle: string;
}

export function ProfileReferralCard({ count, referralCode, origin, handle }: Props) {
  const isOwner = !!referralCode;
  const link = referralCode ? `${origin}/?ref=${referralCode}` : null;

  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-2xl">
          🐀
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-300">
            Friends invited{" "}
            <span className="ml-1 font-mono text-orange-400">{count.toLocaleString()}</span>
          </p>
          <p className="text-xs text-zinc-500">
            {count === 0
              ? isOwner
                ? "Share your link below — every signup credits you."
                : `@${handle} hasn't invited anyone yet.`
              : isOwner
                ? "Each one signed up through your link."
                : "Brought in through their referral link."}
          </p>
        </div>
      </div>
      {isOwner && link && (
        <div className="mt-4 flex items-stretch overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          <input
            type="text"
            value={link}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-transparent px-3 py-2 font-mono text-xs text-zinc-200 focus:outline-none"
          />
          <CopyButton text={link} className="!rounded-none !px-3 !py-2 !text-sm" />
        </div>
      )}
    </Card>
  );
}
