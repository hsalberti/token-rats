import type { SessionRecord } from "@token-rats/contracts";
import { describe, expect, it, vi } from "vitest";
import { SyncQueue } from "../lib/collect.js";
const record: SessionRecord = {
  id: "a",
  source: "codex",
  model: "test",
  inTokens: 1,
  outTokens: 1,
  costUsdCents: 0,
  startedAt: 1000,
  endedAt: 2000,
  dedupeKey: "a",
};
describe("background upload queue", () => {
  it("uploads startup history and retries failed batches without repeating acknowledged records", async () => {
    const queue = new SyncQueue();
    const records = Array.from({ length: 100 }, (_, i) => ({ ...record, id: String(i) }));
    const upload = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({});
    await expect(queue.flush(records, upload)).rejects.toThrow("offline");
    expect(await queue.flush(records, upload)).toBe(10);
    expect(upload.mock.calls[2]?.[0]).toHaveLength(10);
    expect(await queue.flush(records, upload)).toBe(0);
  });
  it("uploads cache-only changes and rescans after restart", async () => {
    const queue = new SyncQueue();
    const upload = vi.fn().mockResolvedValue({});
    await queue.flush([record], upload);
    expect(await queue.flush([{ ...record, cacheReadTokens: 500 }], upload)).toBe(1);
    expect(await new SyncQueue().flush([record], upload)).toBe(1);
  });
});
