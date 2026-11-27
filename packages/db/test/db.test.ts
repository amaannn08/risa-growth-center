import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { snapshot } from '@gc/core';
import {
  MutationError, addCheckin, addDailyMarketing, addPerson, addRegistration, addTargetVersion, applyMutation, changeRegistrationStatus, confirmDraft, createDraft,
  createDb, deleteCampaign, discardDraft, loadDataset, resetToSeed, seedDb, updateCampaign, verifyAgainstReference, type Db,
} from '../src';

let db: Db;
const spend = async (d = '2025-04-20') => snapshot((await loadDataset(db)).ds, d).overall.marketing_spend_inr;
const rev = async () => Number((await db.query('SELECT data_revision FROM app_meta'))[0]!.data_revision);
const count = async (t: string) => Number((await db.query(`SELECT count(*)::int AS n FROM ${t}`))[0]!.n);

beforeAll(async () => { db = await createDb('pglite:memory'); await seedDb(db); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await resetToSeed(db, 'system'); });

describe('db (PGlite)', () => {
  it('seed → verify matches metrics.json (5 snapshots, data quality, full series)', async () => {
    expect(await verifyAgainstReference(db, { full: true })).toEqual([]);
  });

  it('seeding is idempotent', async () => {
    expect((await seedDb(db)).skipped).toBe(true);
  });

  it('mutation bumps revision, writes audit_log, and changes analytics', async () => {
    const r0 = await rev(), a0 = await count('audit_log');
    const res = await addDailyMarketing(db, { campaign_id: 'C02', activity_date: '2025-04-16', marketing_spend_inr: 1000 });
    expect(res.data_revision).toBe(r0 + 1);
    expect(res.id).toBe('AD-C02-0416-U1');
    expect(await count('audit_log')).toBe(a0 + 1);
    const [log] = await db.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1');
    expect(log).toMatchObject({ entity: 'daily_marketing', action: 'create', actor: 'user' });
    expect(await spend()).toBe(275000);
    expect(await spend('2025-04-13')).toBe(276500);
    const { ds, meta } = await loadDataset(db);
    expect(meta.edits_since_reset).toBe(1);
    expect(snapshot(ds, '2025-04-20').campaigns!.C02!.first_touch.rates.cpa_per_attendee_inr).toBeCloseTo(276.47, 2);
  });

  it('reset restores the original dataset, appends (not truncates) the audit log', async () => {
    await addDailyMarketing(db, { campaign_id: 'C02', activity_date: '2025-04-16', marketing_spend_inr: 1000 });
    await updateCampaign(db, 'C02', { status: 'paused' });
    const a = await count('audit_log');
    await resetToSeed(db);
    expect(await spend()).toBe(274000);
    expect((await db.query("SELECT status FROM campaigns WHERE campaign_id='C02'"))[0]!.status).toBe('active');
    expect(await count('audit_log')).toBe(a + 1);
    expect((await db.query('SELECT edits_since_reset FROM app_meta'))[0]!.edits_since_reset).toBe(0);
    expect(await count('tasks')).toBe(8);
  });

  it('double-confirm creates exactly one task; discard creates nothing', async () => {
    const t0 = await count('tasks');
    const { draft_id } = await createDraft(db, { kind: 'task', payload: { title: 'Launch pilot', priority: 'p1', owner_id: 'T03', due_date: '2026-01-20' }, evidence: [{ tool: 'x', metric: 'm', value: 1 }] });
    const [a, b] = await Promise.all([confirmDraft(db, draft_id), confirmDraft(db, draft_id)]);
    expect(await count('tasks')).toBe(t0 + 1);
    expect(a.result_ref).toBe(b.result_ref);
    expect([a.already, b.already].filter(Boolean)).toHaveLength(1);
    const [log] = await db.query("SELECT actor FROM audit_log WHERE entity='tasks' ORDER BY id DESC LIMIT 1");
    expect(log!.actor).toBe('copilot_confirmed');
    const d2 = await createDraft(db, { kind: 'task', payload: { title: 'Nope' } });
    await discardDraft(db, d2.draft_id);
    await expect(confirmDraft(db, d2.draft_id)).rejects.toThrow(/discarded/);
    expect(await count('tasks')).toBe(t0 + 1);
  });

  it('refuses deleting a campaign with activity; validates dates and invariants', async () => {
    await expect(deleteCampaign(db, 'C02')).rejects.toThrow(/status=stopped/);
    await expect(addDailyMarketing(db, { campaign_id: 'C02', activity_date: '2025-05-01', marketing_spend_inr: 5 })).rejects.toBeInstanceOf(MutationError);
    await expect(addDailyMarketing(db, { campaign_id: 'C99', activity_date: '2025-04-01' })).rejects.toThrow(/does not exist/);
    await expect(addRegistration(db, { person_id: 'E0001', campaign_id: 'C01', registered_at: '2025-04-01T10:00' })).rejects.toThrow(/already has a registration/);
    const hist = await db.query("SELECT effective_at::text FROM registration_history WHERE registration_id='R0001' LIMIT 1");
    await expect(changeRegistrationStatus(db, { registration_id: 'R0001', status: 'confirmed', effective_at: String(hist[0]!.effective_at).replace(' ', 'T') + ':00' })).rejects.toThrow(/exactly|already|DUPLICATE|timestamp/i);
  });

  it('walk-in + verified unattributed check-in → visitors 2,051 / identified 3,626; show-up unchanged', async () => {
    const p = await addPerson(db, { person_type: 'external', first_seen_at: '2025-04-13T11:00', person_name: 'Walk In' });
    await addCheckin(db, { person_id: p.id, occurred_at: '2025-04-13T11:05' });
    const o = snapshot((await loadDataset(db)).ds, '2025-04-20').overall;
    expect([o.attended_people, o.identified_external_people, o.registered_and_attended_people, o.registered_people]).toEqual([2051, 3626, 1925, 2800]);
  });

  it('check-in with a repeated explicit id is a no-op (no revision bump)', async () => {
    const p = await addPerson(db, { person_type: 'external', first_seen_at: '2025-04-13T11:00' });
    await addCheckin(db, { event_id: 'CHK-X1', person_id: p.id, occurred_at: '2025-04-13T11:05' });
    const r = await rev();
    const again = await addCheckin(db, { event_id: 'CHK-X1', person_id: p.id, occurred_at: '2025-04-13T11:05' });
    expect(again.noop).toBe(true);
    expect(await rev()).toBe(r);
  });

  it('target version add changes target in effect; status append flips status', async () => {
    await addTargetVersion(db, { effective_at: '2025-04-01', target_version: 'Visitor stretch', identified_external_people_goal: 3600, registration_goal: 3200, unique_external_visitors_goal: 2500, marketing_budget_inr: 300000 });
    const s = snapshot((await loadDataset(db)).ds, '2025-04-20');
    expect(s.target!.target_version).toBe('Visitor stretch');
    expect(s.target_progress!.unique_external_visitors_goal.goal).toBe(2500);
    const before = snapshot((await loadDataset(db)).ds, '2025-04-20').overall.confirmed_people;
    const reg = (await db.query(`SELECT r.registration_id FROM registrations r JOIN registration_history h USING(registration_id) WHERE h.status='interested' AND NOT EXISTS (SELECT 1 FROM registration_history x WHERE x.registration_id=r.registration_id AND x.status<>'interested') LIMIT 1`))[0]!.registration_id;
    await changeRegistrationStatus(db, { registration_id: reg, status: 'confirmed', effective_at: '2025-04-10T10:00' });
    expect(snapshot((await loadDataset(db)).ds, '2025-04-20').overall.confirmed_people).toBe(before + 1);
  });

  it('dispatcher: task lifecycle, campaign pause, readout', async () => {
    const t = await applyMutation(db, 'task', 'create', { title: 'X', campaign_id: 'C02', priority: 'p0' });
    await applyMutation(db, 'task', 'update', { id: t.id, patch: { status: 'done' } });
    expect((await db.query('SELECT status FROM tasks WHERE id=$1', [t.id]))[0]!.status).toBe('done');
    const rev0 = await rev();
    await applyMutation(db, 'campaign', 'update', { id: 'C02', patch: { status: 'paused' } });
    expect((await loadDataset(db)).ds.campaigns.C02!.status).toBe('paused');
    await applyMutation(db, 'experiment', 'readout', { id: 3, observed_value: 17, observed_n: 250, decision: 'scale' });
    expect((await db.query('SELECT status FROM experiments WHERE id=3'))[0]!.status).toBe('scaled');
    expect(await rev()).toBe(rev0 + 2);
  });
});
