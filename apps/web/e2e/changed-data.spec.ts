import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ request }) => {
  const r = await request.post('/api/admin/reset');
  expect((await r.json()).ok).toBe(true);
});

async function addDebit(page: Page) {
  await page.goto('/data');
  await page.getByRole('button', { name: '+ Daily marketing row' }).click();
  await page.getByLabel('campaign', { exact: true }).selectOption('C02');
  await page.getByLabel('activity_date').fill('2025-04-16');
  await page.getByLabel('marketing_spend_inr').fill('1000');
  await page.getByTestId('daily-save').click();
  await expect(page.getByText(/Saved · rev/)).toBeVisible();
}

test('(a) ₹1,000 C02 debit changes close numbers but not 13 Apr; audit log records it', async ({ page }) => {
  await page.goto('/?asOf=2025-04-20');
  await expect(page.getByTestId('kpi-spend')).toContainText('₹274,000');
  await addDebit(page);
  await page.goto('/?asOf=2025-04-20');
  await expect(page.getByTestId('kpi-spend')).toContainText('₹275,000');
  await expect(page.getByTestId('kpi-spend')).toContainText('headroom ₹25,000');
  await page.goto('/campaigns?asOf=2025-04-20');
  await expect(page.getByTestId('cpa-C02')).toHaveText('₹276.47');
  await page.goto('/?asOf=2025-04-13');
  await expect(page.getByTestId('kpi-spend')).toContainText('₹276,500');
  await page.goto('/data?tab=log');
  await expect(page.getByTestId('audit-table')).toContainText('daily_marketing');
  await expect(page.getByTestId('rev-badge')).toContainText('1 edit since reset');
});

test('Copilot names the newly posted debit in the close-to-close reconciliation', async ({ page, request }) => {
  const posted = await request.post('/api/mutations/daily_marketing', {
    data: { action: 'add', campaign_id: 'C07', activity_date: '2025-04-19', marketing_spend_inr: 1379, platform: 'eval' },
  });
  expect((await posted.json()).ok).toBe(true);
  await page.goto('/copilot');
  await page.getByLabel('Ask the Copilot').fill('Compare net spend at event close and data close after a possible new ledger posting. Identify the change.');
  await page.getByRole('button', { name: 'Send' }).click();
  const answer = page.getByTestId('assistant-msg').last();
  await expect(answer).toContainText('₹276,500');
  await expect(answer).toContainText('₹275,379');
  await expect(answer).toContainText('−₹1,121');
  await expect(answer).toContainText(/2025-04-19.*Community Groups.*₹1,379/);
  await expect(answer).not.toContainText(/no spend postings|only credits/i);
});

test('(b) Reset to original dataset restores ₹274,000', async ({ page }) => {
  await addDebit(page);
  await page.goto('/?asOf=2025-04-20');
  await expect(page.getByTestId('kpi-spend')).toContainText('₹275,000');
  await page.getByRole('button', { name: 'Reset to original dataset' }).click();
  await page.getByRole('dialog', { name: 'Confirm reset' }).getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText(/Reset to original dataset · rev/)).toBeVisible();
  await page.goto('/?asOf=2025-04-20');
  await expect(page.getByTestId('kpi-spend')).toContainText('₹274,000');
  await expect(page.getByTestId('rev-badge')).toContainText('0 edits since reset');
  await expect(page.getByTestId('kpi-visitors')).toContainText('2,050');
  await expect(page.getByTestId('kpi-visitors')).toContainText('93.2%');
});

test('(c) Diagnose → Create task → visible on Execution after reload with evidence chip', async ({ page }) => {
  await page.goto('/diagnose');
  const before = (await page.getByTestId('finding').count());
  expect(before).toBeGreaterThan(5);
  const card = page.getByTestId('finding').filter({ has: page.getByRole('button', { name: 'Create task' }) }).first();
  const title = (await card.locator('.text-sm').first().innerText()).slice(0, 40);
  const fid = await card.getAttribute('data-finding-id');
  await card.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByText(/Saved · rev/)).toBeVisible();
  await expect(page.locator(`[data-finding-id="${fid}"]`).getByText(/Task #\d+ exists/)).toBeVisible();
  await page.goto('/execution');
  await page.reload();
  await expect(page.getByTestId('kanban').getByText(title, { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId('col-todo').getByTestId('evidence-chip').first()).toBeVisible();
  // status change persists
  const id = (await page.getByTestId('kanban').locator('[data-testid^="task-"]').filter({ hasText: title }).first().getAttribute('data-testid'))!.replace('task-', '');
  await page.getByLabel(`Status of task ${id}`).selectOption('in_progress');
  await expect(page.getByTestId('col-in_progress').getByTestId(`task-${id}`)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('col-in_progress').getByTestId(`task-${id}`)).toBeVisible();
  await page.goto('/data?tab=log');
  await expect(page.getByTestId('audit-table')).toContainText('tasks');
});

test('(d) pausing C02 persists, shows in the table, and lowers the pre-event projection', async ({ page }) => {
  await page.goto('/?asOf=2025-04-11');
  const proj = async () => Number((await page.getByTestId('projection').locator('.text-xl').nth(1).innerText()).replace(/,/g, ''));
  const before = await proj();
  await page.goto('/campaigns');
  await page.getByTestId('status-C02').selectOption('paused');
  await expect(page.getByText(/Saved · rev/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('status-C02')).toHaveValue('paused');
  await page.goto('/?asOf=2025-04-11');
  expect(await proj()).toBeLessThan(before);
});

test('(e) new target version changes Overview progress', async ({ page }) => {
  await page.goto('/data');
  await page.getByRole('button', { name: '+ Target version' }).click();
  await page.getByLabel('effective_at').fill('2025-04-01T09:00');
  await page.getByLabel('target_version').fill('Visitor stretch plan');
  await page.getByLabel('unique_external_visitors_goal').fill('2500');
  await page.getByTestId('form-save').click();
  await expect(page.getByText(/Saved · rev/)).toBeVisible();
  await page.goto('/?asOf=2025-04-20');
  await expect(page.getByTestId('kpi-visitors')).toContainText('of 2,500');
  await expect(page.getByTestId('kpi-visitors')).toContainText('82.0%');
  await page.goto('/?asOf=2025-03-14');
  await expect(page.getByText('Attendee launch plan').first()).toBeVisible();
});

test('(f) Strategy: editing B1 clubs 15→16 recomputes live (2,417, headline still 2,400) and persists on Save', async ({ page }) => {
  await page.goto('/strategy');
  await expect(page.getByTestId('base-total')).toHaveText('2,401');
  await expect(page.getByTestId('base-headline')).toHaveText('2,400');
  await expect(page.getByTestId('stretch-headline')).toHaveText('2,800');
  await expect(page.getByTestId('sensitivity')).toContainText('2,206');
  await expect(page.getByTestId('score-B1')).toHaveText('92');
  await page.getByTestId('as-b1_clubs-base').fill('16');
  await expect(page.getByTestId('base-total')).toHaveText('2,417');
  await expect(page.getByTestId('base-headline')).toHaveText('2,400');
  await page.getByTestId('save-assumptions').click();
  await expect(page.getByText(/rev/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('base-total')).toHaveText('2,417');
});

test('(g) Diagnose lists the C02 week-of-9-Mar break and the Overview shows the launch plan on 14 Mar', async ({ page }) => {
  await page.goto('/diagnose');
  await expect(page.locator('[data-finding-id="trend_break:C02:2025-03-09"]')).toContainText('105→35');
  await expect(page.locator('[data-finding-id^="trend_break:C04:2025-03-09"]')).toContainText('8→0');
  await expect(page.getByTestId('known-missing')).toContainText('Revenue');
  await page.goto('/?asOf=2025-03-14');
  await expect(page.getByText('Attendee launch plan').first()).toBeVisible();
});

test('(h) experiment readout → decision → follow-up task; campaign pause via management table', async ({ page }) => {
  await page.goto('/execution');
  await page.getByTestId('readout-3').click();
  await page.getByLabel('observed value').fill('17');
  await page.getByLabel('observed n').fill('250');
  await expect(page.getByTestId('readout-decision')).toContainText('Insufficient evidence'); // guardrail observations are mandatory
  await page.getByLabel('guardrail abuse_pct').fill('2');
  await page.getByLabel('guardrail visitor_cost_inr').fill('120');
  await expect(page.getByTestId('readout-decision')).toContainText('Scale');
  await page.getByTestId('readout-save').click();
  await page.getByTestId('readout-followup').click();
  await expect(page.getByTestId('kanban')).toContainText('Follow up: B3'); // wait for the follow-up write before reloading (the first "Saved" toast belongs to the readout)
  await page.reload();
  await expect(page.getByTestId('exp-board').getByTestId('exp-3')).toContainText('Scale');
  await expect(page.getByTestId('kanban')).toContainText('Follow up: B3');
});

test('(i) validation errors surface (date outside window; delete campaign with activity refused)', async ({ page }) => {
  await page.goto('/data');
  await page.getByRole('button', { name: '+ Daily marketing row' }).click();
  await page.getByLabel('activity_date').fill('2025-05-01');
  await page.getByTestId('daily-save').click();
  await expect(page.getByText(/outside the dataset window/)).toBeVisible();
  const r = await page.request.post('/api/mutations/campaign', { data: { action: 'delete', id: 'C02' } });
  expect(r.status()).toBe(400);
  expect((await r.json()).error.message).toMatch(/status=stopped/);
});

test('unknown campaign → 404', async ({ page }) => {
  const res = await page.goto('/campaigns/C99');
  expect(res?.status()).toBe(404);
});
