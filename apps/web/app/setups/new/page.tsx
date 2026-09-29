import { AuthedTopBar } from "../../../components/AuthedTopBar";
import { AgentCapture } from "../../../components/setups/AgentCapture";
import { SetupEditor } from "../../../components/setups/SetupEditor";
import { requireSession } from "../../../lib/auth";
import { getServerLocale } from "../../../lib/server-locale";
export const runtime = "edge";
export const metadata = { title: "New setup" };
export default async function Page() {
  const user = await requireSession();
  return (
    <>
      <AuthedTopBar user={user} locale={await getServerLocale()} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <AgentCapture />
        <div className="mt-8">
          <SetupEditor />
        </div>
      </main>
    </>
  );
}
