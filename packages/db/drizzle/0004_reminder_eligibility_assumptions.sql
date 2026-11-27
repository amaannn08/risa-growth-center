-- Round 3: B4 reminder treatment is constrained to opted-in confirmed registrants after the holdout.
-- Adds the opt-in rate and holdout share, revises the stretch treatment target to the feasible 2,229 (2,500 needed >= 3,125 eligible; the stretch plan has 3,097 confirmed),
-- adds the two-wave cadence (day-of wave = +0.7 pp, ASSUMPTION) that restores the 2,850 stretch, and keeps the stretch day split at 1,600 + 1,600 - 350. Applied to BOTH public and seed; only rows still at the old shipped defaults are changed.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.plan_assumptions', 'seed.plan_assumptions'] LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($f$INSERT INTO %s (key, scenario, "group", value, unit, label, kind) VALUES
      ('b4_optin', 'base', 'reminders', 0.9, 'ratio', 'B4 share of confirmed registrants who opted in to WhatsApp', 'assumption'),
      ('b4_optin', 'stretch', 'reminders', 0.9, 'ratio', 'B4 share of confirmed registrants who opted in to WhatsApp', 'assumption'),
      ('b4_holdout', 'base', 'reminders', 0.2, 'ratio', 'B4 holdout share of opted-in confirmed registrants (stratified ~20%%)', 'assumption'),
      ('b4_holdout', 'stretch', 'reminders', 0.2, 'ratio', 'B4 holdout share of opted-in confirmed registrants (stratified ~20%%)', 'assumption'),
      ('b4_wave2_pp', 'base', 'reminders', 0, 'pp', 'ASSUMPTION: incremental show-up lift from a 2nd, day-of reminder wave (base: pre-event wave only). ~12%% of the wave-1 lift, i.e. strongly diminishing returns on the same people; unvalidated, to be measured by the B4 holdout', 'assumption'),
      ('b4_wave2_pp', 'stretch', 'reminders', 0.7, 'pp', 'ASSUMPTION: incremental show-up lift from a 2nd, day-of reminder wave (base: pre-event wave only). ~12%% of the wave-1 lift, i.e. strongly diminishing returns on the same people; unvalidated, to be measured by the B4 holdout', 'assumption')
      ON CONFLICT (key, scenario) DO NOTHING$f$, t);
    EXECUTE format($f$UPDATE %s SET value = 2229, label = 'B4 target treated (capped at ⌊⌊confirmed × opt-in⌋ × (1 − holdout)⌋)' WHERE key = 'b4_treated' AND scenario = 'stretch' AND value = 2500$f$, t);
    EXECUTE format($f$UPDATE %s SET label = 'B4 target treated (capped at ⌊⌊confirmed × opt-in⌋ × (1 − holdout)⌋)' WHERE key = 'b4_treated' AND scenario = 'base'$f$, t);
  END LOOP;
END $$;
--> statement-breakpoint
