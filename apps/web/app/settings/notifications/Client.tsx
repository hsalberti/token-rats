"use client";

/**
 * NotificationsClient — client component for the notification settings page.
 *
 * Renders toggle switches for:
 *   - Weekly digest email
 *   - Room challenge alerts (push)
 *   - "You got passed" alerts (push)
 *
 * Plus:
 *   - "Enable browser push" button — calls subscribeToPush()
 *   - "Send test push" button — calls sendTestPush()
 */

import { upsertNotificationPrefs } from "@/lib/api";
import { sendTestPush, subscribeToPush } from "@/lib/push";
import type { NotificationPrefs } from "@token-rats/contracts";
import { useState } from "react";

interface Props {
  initialPrefs: NotificationPrefs;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-orange-500" : "bg-zinc-700",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0",
          "transition-transform duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

export function NotificationsClient({ initialPrefs }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const [pushStatus, setPushStatus] = useState<
    "idle" | "requesting" | "enabled" | "denied" | "unsupported" | "error"
  >("idle");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function updatePref<K extends keyof NotificationPrefs>(
    key: K,
    value: NotificationPrefs[K],
  ) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    setSaveStatus("idle");

    try {
      const data = await upsertNotificationPrefs({ [key]: value });
      setPrefs(data.prefs);
      setSaveStatus("saved");
    } catch {
      // Revert on error
      setPrefs(prefs);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnablePush() {
    setPushStatus("requesting");
    try {
      const result = await subscribeToPush();
      if (result.ok) {
        setPushStatus("enabled");
      } else {
        setPushStatus(
          result.reason === "denied"
            ? "denied"
            : result.reason === "unsupported"
              ? "unsupported"
              : "error",
        );
      }
    } catch {
      setPushStatus("error");
    }
  }

  async function handleTestPush() {
    setTestStatus("sending");
    try {
      await sendTestPush();
      setTestStatus("sent");
    } catch {
      setTestStatus("error");
    }
  }

  return (
    <div className="space-y-8">
      {/* Email section */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-zinc-100">Email</h2>
        <div className="bg-zinc-900 rounded-xl divide-y divide-zinc-800">
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="font-medium">Weekly digest</div>
              <div className="text-sm text-zinc-400">
                A Monday summary of your token burn vs. your rooms.
              </div>
            </div>
            <Toggle
              checked={prefs.weeklyDigest}
              onChange={(v) => updatePref("weeklyDigest", v)}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* Push section */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-zinc-100">Push notifications</h2>
        <div className="bg-zinc-900 rounded-xl divide-y divide-zinc-800">
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="font-medium">Room challenge alerts</div>
              <div className="text-sm text-zinc-400">
                Notify when a room challenge is ending soon.
              </div>
            </div>
            <Toggle
              checked={prefs.roomChallenges}
              onChange={(v) => updatePref("roomChallenges", v)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="font-medium">You got passed</div>
              <div className="text-sm text-zinc-400">
                Notify when someone overtakes you on the leaderboard.
              </div>
            </div>
            <Toggle
              checked={prefs.passed}
              onChange={(v) => updatePref("passed", v)}
              disabled={saving}
            />
          </div>
        </div>

        {saveStatus === "saved" && <p className="text-sm text-green-500 mt-2">Saved.</p>}
        {saveStatus === "error" && (
          <p className="text-sm text-red-500 mt-2">Failed to save. Please try again.</p>
        )}
      </section>

      {/* Browser push setup */}
      <section>
        <h2 className="text-lg font-semibold mb-2 text-zinc-100">Browser push</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Enable browser notifications so we can ping you even when the tab is closed.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={pushStatus === "requesting" || pushStatus === "enabled"}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold",
              "transition-colors duration-150",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              pushStatus === "enabled"
                ? "bg-green-700 text-white"
                : "bg-orange-500 text-white hover:bg-orange-600",
            ].join(" ")}
          >
            {pushStatus === "requesting" && "Requesting permission..."}
            {pushStatus === "enabled" && "Push enabled"}
            {(pushStatus === "idle" || pushStatus === "error") && "Enable browser push"}
            {pushStatus === "denied" && "Permission denied"}
            {pushStatus === "unsupported" && "Not supported"}
          </button>

          <button
            type="button"
            onClick={handleTestPush}
            disabled={testStatus === "sending"}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold",
              "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-colors duration-150",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {testStatus === "sending" && "Sending..."}
            {testStatus === "sent" && "Sent!"}
            {testStatus === "error" && "Error — retry"}
            {testStatus === "idle" && "Send test push"}
          </button>
        </div>

        {pushStatus === "denied" && (
          <p className="text-sm text-red-400 mt-2">
            You denied notification permission. Reset it in your browser settings.
          </p>
        )}
        {pushStatus === "unsupported" && (
          <p className="text-sm text-zinc-400 mt-2">Web Push is not supported in this browser.</p>
        )}
        {testStatus === "error" && (
          <p className="text-sm text-red-400 mt-2">
            Test push failed. Make sure browser push is enabled first.
          </p>
        )}
      </section>
    </div>
  );
}
