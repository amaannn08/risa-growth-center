import { coverageEnd, type Dataset } from '../dataset';
import { snapshot } from '../snapshot';
import { UNATTR } from '../types';
import type { CampaignHistory } from './defaults';

/** 2025 first-touch outcomes at coverage end, derived from live data (equals DEFAULT_HISTORY on the pristine dataset). */
export function historyFromDataset(ds: Dataset): { history: CampaignHistory[]; visitors2025: number } {
  const s = snapshot(ds, coverageEnd(ds));
  const history = Object.entries(s.campaigns!).filter(([id]) => id !== UNATTR).map(([id, v]) => ({
    campaign_id: id, name: v.campaign_name, spend: v.first_touch.marketing_spend_inr, registered: v.first_touch.registered_people,
    confirmed: v.first_touch.confirmed_people, visitors: v.first_touch.attended_people,
  }));
  return { history, visitors2025: s.overall.attended_people };
}
