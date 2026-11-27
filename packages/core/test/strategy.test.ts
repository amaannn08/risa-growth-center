import { describe, expect, it } from 'vitest';
import { BETS, DEFAULT_ASSUMPTIONS, DEFAULT_HISTORY, historyFromDataset, scoreBets, snapshot, strategyModel } from '../src';
import { ds } from './helpers';

const m = strategyModel();
describe('strategy model §7', () => {
  it('reference', () => {
    const ref = m.base.reference;
    const strong = ref.campaigns.filter((c) => ['C01', 'C04', 'C05', 'C06', 'C07'].includes(c.campaign_id));
    expect([strong.reduce((s, c) => s + c.registered, 0), strong.reduce((s, c) => s + c.confirmed, 0), strong.reduce((s, c) => s + c.visitors, 0)]).toEqual([1770, 1630, 1410]);
    const c02 = ref.campaigns.find((c) => c.campaign_id === 'C02')!, c03 = ref.campaigns.find((c) => c.campaign_id === 'C03')!;
    expect([c02.registered, c02.confirmed, c02.visitors]).toEqual([256, 218, 128]);
    expect([c03.registered, c03.confirmed, c03.visitors]).toEqual([136, 113, 68]);
    expect([ref.registered, ref.confirmed, ref.visitors, ref.spend]).toEqual([2162, 1961, 1606, 180000]);
  });
  it('bets visitors', () => {
    const v = (s: 'base' | 'stretch') => Object.fromEntries(m[s].bets.map((b) => [b.id, b.visitors]));
    expect(v('base')).toEqual({ B1: 240, B2: 180, B3: 150, B5: 30, B4: 70 });
    expect(v('stretch')).toEqual({ B1: 383, B2: 281, B3: 240, B5: 70, B4: 145 });
  });
  it('chain: regs, confirmed, visitors, headline', () => {
    expect([m.base.added_regs, m.stretch.added_regs]).toEqual([810, 1235]);
    expect([m.base.added_confirmed, m.stretch.added_confirmed]).toEqual([729, 1136]);
    expect([m.base.registrations, m.stretch.registrations]).toEqual([2972, 3397]);
    expect([m.base.confirmed, m.stretch.confirmed]).toEqual([2690, 3097]);
    expect([m.base.acquisition_visitors, m.stretch.acquisition_visitors]).toEqual([600, 974]);
    expect([m.base.registered_visitors, m.stretch.registered_visitors]).toEqual([2276, 2725]);
    expect(m.base.show_up_of_registrations).toBeCloseTo(0.766, 3);
    expect(m.stretch.show_up_of_registrations).toBeCloseTo(0.802, 3);
    expect([m.base.total, m.stretch.total]).toEqual([2401, 2850]);
  });
  it('floor rule: headline = floor(total/50)*50', () => {
    expect([m.base.headline, m.stretch.headline]).toEqual([2400, 2850]);
    // gate: B1 clubs 15→16 adds 16 visitors → total 2417, headline still 2400
    const as = DEFAULT_ASSUMPTIONS.map((a) => (a.key === 'b1_clubs' && a.scenario === 'base' ? { ...a, value: 16 } : a));
    const m2 = strategyModel(as);
    expect(m2.base.bets[0]!.visitors).toBe(256);
    expect(m2.base.total).toBe(2417);
    expect(m2.base.headline).toBe(2400);
  });
  it('spend, reserve, CPA', () => {
    expect([m.base.spend, m.stretch.spend]).toEqual([273000, 279000]);
    expect([m.base.reserve, m.stretch.reserve]).toEqual([27000, 21000]);
    expect([m.base.cpa.registration, m.base.cpa.visitor, m.base.cpa.full_cap_visitor].map(Math.round)).toEqual([92, 114, 125]);
    expect([m.stretch.cpa.registration, m.stretch.cpa.visitor, m.stretch.cpa.full_cap_visitor].map(Math.round)).toEqual([82, 98, 105]);
    expect(m.reconciliation.base.budget_sums_to_cap && m.reconciliation.stretch.budget_sums_to_cap).toBe(true);
  });
  it('reach cross-check', () => {
    expect(m.base.reach.pool).toBe(120000);
    expect(m.base.reach.identified_of_reach).toBeCloseTo(0.0625, 4);
    expect(m.stretch.reach.identified_of_reach).toBeCloseTo(0.05714, 4);
    expect(m.base.reach.regs_per_identified).toBeCloseTo(0.5944, 4);
    expect(m.stretch.reach.regs_per_identified).toBeCloseTo(0.5662, 4);
  });
  it('sensitivity and capacity', () => {
    expect(m.sensitivity.base.no_reminders_no_walkins).toBe(2206);
    expect(m.sensitivity.base.showup_drop_visitors).toBe(-149);
    expect([m.base.capacity.weekend_unique, m.stretch.capacity.weekend_unique]).toEqual([2400, 2850]);
    expect(m.base.capacity.scans_per_hour).toBe(1920);
    expect(m.base.capacity.exceeds_weekend_cap).toBe(false);
    const big = strategyModel(DEFAULT_ASSUMPTIONS.map((a) => (a.key === 'cap_weekend' ? { ...a, value: 2000 } : a)));
    expect(big.base.capacity.exceeds_weekend_cap).toBe(true);
  });
  it('growth vs 2025', () => {
    expect(m.growth_vs_2025.base).toBeCloseTo(0.17, 2);
    expect(m.growth_vs_2025.stretch).toBeCloseTo(0.39, 2);
  });
  it('bet scores 92/85/80/71/54', () => {
    expect(scoreBets(BETS.map((b) => ({ id: b.id, impact: b.impact, confidence: b.confidence, ease: b.ease }))).map((s) => [s.id, s.score])).toEqual([['B1', 92], ['B2', 85], ['B3', 80], ['B4', 71], ['B5', 54]]);
  });
  it('DEFAULT_HISTORY equals the dataset (D)', () => {
    const snap = snapshot(ds(), '2025-04-20');
    for (const h of DEFAULT_HISTORY) {
      const f = snap.campaigns![h.campaign_id]!.first_touch;
      expect([h.spend, h.registered, h.confirmed, h.visitors]).toEqual([f.marketing_spend_inr, f.registered_people, f.confirmed_people, f.registered_and_attended_people]);
    }
  });
});

describe('historyFromDataset', () => {
  it('equals DEFAULT_HISTORY on the pristine dataset', () => {
    const h = historyFromDataset(ds());
    expect(h.history).toEqual(DEFAULT_HISTORY);
    expect(h.visitors2025).toBe(2050);
  });
});
