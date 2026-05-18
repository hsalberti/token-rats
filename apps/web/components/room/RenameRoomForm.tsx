"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface RenameRoomFormProps {
  currentName: string;
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}

export function RenameRoomForm({ currentName, onRename, onClose }: RenameRoomFormProps) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRename(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename room");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={64}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-zinc-100 text-lg font-black focus:border-rat-500 focus:outline-none focus:ring-1 focus:ring-rat-500"
      />
      <Button type="submit" size="sm" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
