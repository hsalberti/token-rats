-- Migration 0020: backfill an early cursor-composer price snapshot.
--
-- Migration 0016 seeded the synthetic `cursor-composer` catalog row plus ONE
-- price snapshot dated `DATE('now')` (the day 0016 was applied). pricing.ts
-- resolves cost via carry-forward: the latest snapshot with `day <= session.day`.
-- That means any Cursor session whose UTC day predates the 0016 apply-date had
-- NO snapshot ≤ its day, so priceOf returned `known:false, costUsdCents:0` —
-- exactly the "Cursor: N sessions, …, $0.00" symptom on live profiles.
--
-- Fix: insert a cursor-composer snapshot dated far in the past so carry-forward
-- covers every historical (and future) Cursor session at the same
-- claude-3-5-sonnet rates ($3 in / $15 out per MTok) used by the 0016 seed.
-- The (day, model_id) primary key + ON CONFLICT DO NOTHING keeps this additive
-- and idempotent; it never touches the existing 0016 snapshot or the cron's
-- daily rows.
--
-- After deploy, run `POST /v1/admin/prices/recompute` once so existing Cursor
-- sessions get re-stamped and the rollups rebuilt — the new snapshot only
-- changes future ingests until a recompute re-prices the historical rows.

INSERT INTO model_price_snapshots (day, model_id, input_per_mtok, output_per_mtok, source, fetched_at)
VALUES ('2024-01-01', 'cursor-composer', 3.0, 15.0, 'cursor-estimate', CAST(strftime('%s', 'now') AS INTEGER) * 1000)
ON CONFLICT(day, model_id) DO NOTHING;
