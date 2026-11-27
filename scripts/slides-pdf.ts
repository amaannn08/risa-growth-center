/**
 * pnpm slides:pdf   (BASE_URL default http://localhost:3000; server must be running on a local/eval DB)
 * Resets the DB to the seeded state, renders /slides in Chromium and writes docs/strategy-slides.pdf (3 pages, 13.333×7.5 in = 960×540 pt).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.env.BASE_URL ?? process.argv[2] ?? 'http://localhost:3000';
const out = resolve(__dirname, '../docs/strategy-slides.pdf');
mkdirSync(resolve(__dirname, '../docs'), { recursive: true });

async function main() {
  const r = await fetch(`${base}/api/admin/reset`, { method: 'POST' });
  if (!r.ok) throw new Error(`reset failed: ${r.status}`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${base}/slides`, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: out, width: '13.333in', height: '7.5in', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log('wrote', out);
}
main().catch((e) => { console.error(e); process.exit(1); });
