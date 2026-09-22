import { requireSession } from "@/lib/auth";
import { ComparisonClient } from "./Client";
export const runtime = "edge";
export const metadata = { title: "Compare subscriptions — Token Rats" };
export default async function ComparePage() {
  await requireSession();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-6">
      <a href="/app" className="text-rat-400">
        ← Dashboard
      </a>
      <h1 className="text-3xl font-bold">What do you get from each subscription?</h1>
      <p className="text-zinc-400">
        Compare your recorded usage in the same calendar month. Enter what you paid in USD. API
        estimates do not measure work quality or your provider bill.
      </p>
      <ComparisonClient />
    </main>
  );
}
