-- PLAN_Features_v0.4 §46: switch difficulty to the canonical FSRS-5 scale [1, 10].
-- The stability formula `(11 - D)` is designed for D in [1, 10]; with the old
-- [0, 1] clamp the multiplier was a near-constant and difficulty had almost no
-- effect on scheduling.

-- 1. Normalize existing rows: old scale [0, 1] -> new scale [1, 10].
--    difficulty * 10 maps 0.35 -> 3.5, 1 -> 10; GREATEST(1, ...) lifts 0 -> 1.
UPDATE "UserWordProgress"
SET "difficulty" = GREATEST(1, LEAST("difficulty" * 10, 10));

-- 2. New rows start at the neutral midpoint of the new scale.
ALTER TABLE "UserWordProgress" ALTER COLUMN "difficulty" SET DEFAULT 5;
