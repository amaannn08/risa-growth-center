-- Round 4: the day-of reminder increment is UNTESTED until pre-event + day-of is compared with pre-event only; the holdout alone measures the combined effect.
-- Relabels the assumption in BOTH public and seed; only rows still carrying the old shipped label are changed.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.plan_assumptions', 'seed.plan_assumptions'] LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($f$UPDATE %s SET label = 'ASSUMPTION: incremental show-up lift from a 2nd, day-of reminder wave (base: pre-event wave only). ~12%% of the wave-1 lift, i.e. strongly diminishing returns on the same people; UNTESTED until the day-of increment is measured: pre-event + day-of vs pre-event-only among treated people (the holdout alone measures only the combined program effect)' WHERE key = 'b4_wave2_pp' AND label LIKE '%%unvalidated, to be measured by the B4 holdout'$f$, t);
  END LOOP;
END $$;
--> statement-breakpoint
