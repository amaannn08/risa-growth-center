-- Reconcile the shipped stretch day split with the split-arm B4 projection.
UPDATE public.plan_assumptions SET value = 1592 WHERE key = 'day2_visitors' AND scenario = 'stretch' AND value = 1600;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('seed.plan_assumptions') IS NOT NULL THEN
    UPDATE seed.plan_assumptions SET value = 1592 WHERE key = 'day2_visitors' AND scenario = 'stretch' AND value = 1600;
  END IF;
END $$;
