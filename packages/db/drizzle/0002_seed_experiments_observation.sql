-- Databases created before 0001 already have a pristine `seed` schema: keep seed.experiments column-compatible with public.experiments.
ALTER TABLE IF EXISTS "seed"."experiments" ADD COLUMN IF NOT EXISTS "observation" jsonb;
