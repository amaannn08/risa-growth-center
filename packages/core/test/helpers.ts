import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDataset, type RawInput } from '../src';

const ROOT = resolve(__dirname, '../../..');
const raw = (slug: string) => JSON.parse(readFileSync(`${ROOT}/data/source/raw/${slug}.json`, 'utf8'));
export const loadRaw = (): RawInput => ({
  read_me: raw('read_me'), field_guide: raw('field_guide'), event: raw('event'), targets: raw('targets'),
  campaigns: raw('campaigns'), daily_marketing: raw('daily_marketing'), people: raw('people'), interactions: raw('interactions'),
  registrations: raw('registrations'), registration_history: raw('registration_history'), checkins: raw('checkins'),
});
export const ds = () => buildDataset(loadRaw());
export const manifest = () => JSON.parse(readFileSync(`${ROOT}/data/source/manifest.json`, 'utf8'));
