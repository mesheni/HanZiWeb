-- Add `timezone` column to User for tz-aware daily stats (PLAN_Features_v0.4 §24).
-- IANA timezone name (e.g. "Europe/Moscow"). NULL means UTC.
-- Existing rows get a NULL value; the server code falls back to "UTC" when reading.
-- Backfill is intentionally not done here so production can opt-in per user via SQL:
--   UPDATE "User" SET "timezone" = 'Europe/Moscow' WHERE id = '...';
ALTER TABLE "User" ADD COLUMN "timezone" TEXT;
