/** BASE_URL=http://localhost:3000 pnpm tsx scripts/screenshots.ts — full-page PNGs of every page into docs/screenshots (+ a live Copilot answer if COPILOT_SHOT=1). */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const dir = resolve(__dirname, '../docs/screenshots');
mkdirSync(dir, { recursive: true });
const pages: [string, string][] = [
  ['overview', '/'], ['overview-event-close', '/?asOf=2025-04-13'], ['campaigns', '/campaigns'], ['campaign-detail', '/campaigns/C02'], ['diagnose', '/diagnose'],
  ['strategy', '/strategy'], ['execution', '/execution'], ['data', '/data'], ['copilot', '/copilot'],
];

async function main() {
  await fetch(`${base}/api/admin/reset`, { method: 'POST' });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const [name, path] of pages) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: name !== 'copilot' });
    console.log('shot', name);
  }
  if (process.env.COPILOT_SHOT === '1') {
    await page.goto(`${base}/?asOf=2025-04-13`, { waitUntil: 'networkidle' });
    await page.getByTestId('copilot-toggle').click();
    for (const q of ['Why did we miss the visitor target?', 'What if we move ₹10k from Paid Social to College Partnerships?']) {
      const n = await page.getByTestId('assistant-msg').count();
      await page.getByLabel('Ask the Copilot').fill(q);
      await page.getByRole('button', { name: 'Send' }).click();
      await page.waitForFunction((k) => document.querySelectorAll('[data-testid="assistant-msg"]').length > k && !document.querySelector('[data-testid="thinking"]'), n, { timeout: 90_000 });
    }
    await page.getByTestId('assistant-msg').last().getByRole('button', { name: /Sources/ }).click();
    await page.screenshot({ path: `${dir}/copilot-panel.png` });
    console.log('shot copilot-panel');
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
