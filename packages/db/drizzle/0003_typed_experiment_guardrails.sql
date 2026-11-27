-- Round 3: experiment guardrails become typed records {key,label,op,value,hard?,stop_op?,stop_value?}.
-- Databases seeded before this migration hold the five shipped guardrail sets as arrays of free-text strings, which the adjudicator cannot check.
-- Each known legacy set is matched EXACTLY (bet_id + legacy jsonb); anything else is left untouched and is treated as "insufficient evidence" by the adjudicator.
-- Applied to BOTH public.experiments and seed.experiments (so "reset" restores typed rules). Idempotent: typed rows no longer match the legacy value.
DO $$
DECLARE
  t text;
  m jsonb := '[
    {"bet":"B1","legacy":["confirmed ≥ 85% at T−14","incremental visitor cost ≤ ₹180"],"typed":[{"key":"confirmed_pct","label":"confirmed ≥ 85% at T−14","op":">=","value":85},{"key":"visitor_cost_inr","label":"incremental visitor cost ≤ ₹180","op":"<=","value":180,"hard":true}]},
    {"bet":"B2","legacy":["duplicate/ineligible ≤ 5%","confirmed ≥ 80% by T−14"],"typed":[{"key":"duplicate_pct","label":"duplicate/ineligible ≤ 5%","op":"<=","value":5,"hard":true},{"key":"confirmed_pct","label":"confirmed ≥ 80% by T−14","op":">=","value":80}]},
    {"bet":"B3","legacy":["abuse ≤ 5%","≤ ₹180 / incremental visitor"],"typed":[{"key":"abuse_pct","label":"abuse ≤ 5%","op":"<=","value":5,"hard":true},{"key":"visitor_cost_inr","label":"≤ ₹180 / incremental visitor","op":"<=","value":180,"hard":true}]},
    {"bet":"B4","legacy":["delivery ≥ 90%","opt-out ≤ 2%"],"typed":[{"key":"delivery_pct","label":"delivery ≥ 90%","op":">=","value":90},{"key":"optout_pct","label":"opt-out ≤ 2%","op":"<=","value":2,"hard":true}]},
    {"bet":"B5","legacy":["T−7 confirmation ≥ 85%","marginal visitor cost ≤ ₹200"],"typed":[{"key":"confirmation_pct","label":"T−7 confirmation ≥ 85%","op":">=","value":85,"stop_op":"<","stop_value":75},{"key":"marginal_visitor_cost_inr","label":"marginal visitor cost ≤ ₹200","op":"<=","value":200,"hard":true}]}
  ]'::jsonb;
  r jsonb;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.experiments', 'seed.experiments'] LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(m) LOOP
      EXECUTE format('UPDATE %s SET guardrails = $1 WHERE bet_id = $2 AND guardrails = $3', t)
        USING r->'typed', r->>'bet', r->'legacy';
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint
