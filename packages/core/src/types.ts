/** Timestamp input: ISO string (with offset) or epoch ms. Normalised to ISO +05:30 strings by buildDataset. */
export type Ts = string | number;
export type Attribution = 'first_touch' | 'registration_source' | 'checkin_source';
export const STATUSES = ['interested', 'confirmed', 'cancelled', 'waitlisted'] as const;
export type Status = (typeof STATUSES)[number];
export const UNATTR = 'unattributed';

type Rec = { [k: string]: any };
export interface EventRow extends Rec { event_name: string; history_start: Ts; history_end: Ts; event_starts_at: Ts; event_ends_at: Ts; timezone: string; currency: string; fictional: boolean }
export interface TargetRow extends Rec { effective_at: Ts; identified_external_people_goal: number; registration_goal: number; unique_external_visitors_goal: number; marketing_budget_inr: number; target_version: string }
export interface CampaignRow extends Rec { campaign_id: string; campaign_name: string; channel: string; owner_id: string; owner_name: string; created_at: Ts; planned_start_at: Ts; planned_end_at: Ts }
export interface DailyRow extends Rec { activity_id: string; campaign_id: string; activity_date: string; impressions: number; clicks: number; reported_reach: number; landing_page_sessions: number; registration_starts: number; marketing_spend_inr: number }
export interface PersonRow extends Rec { person_id: string; person_name: string; person_type: string; first_seen_at: Ts; first_campaign_id: string | null; owner_id: string | null }
export interface InteractionRow extends Rec { interaction_id: string; person_id: string; campaign_id: string | null; occurred_at: Ts; event_type: string }
export interface RegistrationRow extends Rec { registration_id: string; person_id: string; campaign_id: string | null; registered_at: Ts }
export interface HistoryRow extends Rec { history_id: string; registration_id: string; person_id: string; campaign_id: string | null; effective_at: Ts; status: Status }
export interface CheckinRow extends Rec { event_id: string; person_id: string; registration_id: string | null; campaign_id: string | null; occurred_at: Ts; result: string; verification: string; source: string }

/** Everything the engine needs. Shape = data/source/raw/*.json (or DB rows). */
export interface RawInput {
  read_me?: Rec[]; field_guide?: Rec[];
  event: EventRow[]; targets: TargetRow[]; campaigns: CampaignRow[]; daily_marketing: DailyRow[];
  people: PersonRow[]; interactions: InteractionRow[]; registrations: RegistrationRow[];
  registration_history: HistoryRow[]; checkins: CheckinRow[];
}

export interface TableQuality {
  raw_rows: number; unique_rows: number; duplicate_extra_rows: number;
  duplicate_keys: { key: unknown[]; extra_rows: number }[];
  raw_nulls: Record<string, number>; deduped_nulls: Record<string, number>;
}
