import { expect, test } from '@playwright/test';

// COPILOT_MODE=mock (playwright.config): the mock still calls the REAL tools (get_funnel, propose_task), so evidence/draft plumbing is real.
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ request }) => { expect((await (await request.post('/api/admin/reset')).json()).ok).toBe(true); });

test('as-of cutoff: C02 detail on Monday 3 Mar shows ₹0 posted for the running week and marks it partial', async ({ page }) => {
  await page.goto('/campaigns/C02?asOf=2025-03-03');
  const cell = page.getByTestId('week-spend-03-03');
  await expect(cell).toContainText('₹0');
  await expect(cell).toContainText('partial');
  await expect(cell).toHaveAttribute('data-partial', 'true');
  await expect(cell).not.toContainText('14.4k'); // the whole-week figure must not leak
  // a Sunday closes the week: not partial, full-week spend
  await page.goto('/campaigns/C02?asOf=2025-03-09');
  await expect(page.getByTestId('week-spend-03-03')).toHaveAttribute('data-partial', 'false');
  await expect(page.getByTestId('week-spend-03-03')).toContainText('14.4k');
});

test('Diagnose at 3 Mar: running week is flagged partial; quality panel is labelled full-coverage and uses the selected snapshot for walk-ins', async ({ page }) => {
  await page.goto('/diagnose?asOf=2025-03-03');
  await expect(page.getByTestId('heat').locator('th', { hasText: '03-03*' })).toBeVisible();
  await expect(page.getByText(/FULL dataset/)).toBeVisible();
  await expect(page.getByTestId('dq')).toContainText('0 verified walk-ins with no registration as of 2025-03-03');
  await page.goto('/diagnose?asOf=2025-04-20');
  await expect(page.getByTestId('dq')).toContainText('125 verified walk-ins');
  await expect(page.getByTestId('dq')).toContainText('73.21%');
});

test('confirmed Copilot draft keeps its evidence chip (with date and revision) on the new board card', async ({ page }) => {
  await page.goto('/copilot');
  await page.getByLabel('Ask the Copilot').fill('Draft a reminder task for me');
  await page.getByRole('button', { name: 'Send' }).click();
  const card = page.getByTestId('draft-card').last();
  await expect(card).toContainText('needs your confirmation');
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(card).toContainText(/Task #\d+ created/);
  const id = (await card.innerText()).match(/Task #(\d+) created/)![1]!;
  await page.goto('/execution');
  const task = page.getByTestId(`task-${id}`);
  await expect(task).toContainText('Mock: reconfirmation reminder');
  const chip = task.getByTestId('evidence-chip');
  await expect(chip).toBeVisible(); // on THIS card, not just any card
  await expect(chip).toContainText('cancelled');
  await chip.click();
  await expect(task.getByTestId('evidence-detail')).toContainText(/as of 2025-04-20/);
  await expect(task.getByTestId('evidence-detail')).toContainText(/rev \d+/);
});

test('experiment readout without a sample size → insufficient evidence (server decides, client decision is ignored)', async ({ page, request }) => {
  await page.goto('/execution');
  await page.getByTestId('readout-3').click();
  await page.getByLabel('observed value').fill('30');
  await page.getByLabel('guardrail abuse_pct').fill('1');
  await page.getByLabel('guardrail visitor_cost_inr').fill('100');
  await expect(page.getByTestId('readout-decision')).toContainText('Insufficient evidence');
  await expect(page.getByTestId('readout-missing')).toContainText('sample size');
  await page.getByTestId('readout-save').click();
  await expect(page.getByTestId('readout-followup')).toBeVisible();
  await page.reload();
  const exp3 = page.getByTestId('exp-3');
  await expect(exp3).toContainText('Insufficient evidence');
  await expect(exp3).not.toContainText(/→\s*Scale/);
  // API: a forged decision cannot bypass the missing sample
  const r = await request.post('/api/mutations/experiment', { data: { action: 'readout', id: 1, observed_value: 99, decision: 'scale' } });
  expect(r.status()).toBe(200);
  expect((await r.json()).row.decision).toBe('insufficient_sample');
});

test('B5 reserve gate and B4 final holdout are shown as distinct decisions', async ({ page }) => {
  await page.goto('/execution');
  await page.getByTestId('readout-5').click();
  await expect(page.getByTestId('gate-box')).toContainText('Reserve release');
  await page.getByLabel('gate forecast_extra_visitors').fill('30');
  await page.getByLabel('gate forecast_visitor_cost_inr').fill('140');
  await expect(page.getByTestId('gate-decision')).toContainText('Hold reserve');
  await page.getByLabel('gate forecast_extra_visitors').fill('45');
  await expect(page.getByTestId('gate-decision')).toContainText('Release reserve');
});

test('every experiment form exposes its typed guardrail inputs; B5 confirmation below the 75% hard floor is Stop and holds the reserve', async ({ page }) => {
  for (const [id, key] of [[1, 'confirmed_pct'], [2, 'duplicate_pct'], [3, 'abuse_pct'], [4, 'delivery_pct'], [5, 'confirmation_pct']] as const) {
    await page.goto('/execution');
    await page.getByTestId(`readout-${id}`).click();
    await expect(page.getByLabel(`guardrail ${key}`)).toBeVisible();
    await expect(page.getByTestId('readout-unparsed')).toHaveCount(0);
  }
});

test('B5 hard floor: confirmation 70% → Stop and the reserve is held (server-adjudicated); 80% → Change; 90% → Scale', async ({ request }) => {
  const post = async (conf: number) => (await (await request.post('/api/mutations/experiment', { data: { action: 'readout', id: 5, observed_value: 12, observed_n: 500, guardrail_observations: { confirmation_pct: conf, marginal_visitor_cost_inr: 150 }, gate_inputs: { forecast_extra_visitors: 45, forecast_visitor_cost_inr: 140 } } })).json()).row;
  const stop = await post(70);
  expect(stop.decision).toBe('stop'); expect(stop.observation.gates[0].decision).toBe('hold');
  expect((await post(80)).decision).toBe('change');
  const ok = await post(90);
  expect(ok.decision).toBe('scale'); expect(ok.observation.gates[0].decision).toBe('release');
});

test('readout form + server reject a KPI that conflicts with its counts (B3: 90% vs 1/250)', async ({ page, request }) => {
  await page.goto('/execution');
  await page.getByTestId('readout-3').click();
  await page.getByLabel('observed value').fill('90');
  await page.getByLabel('kpi numerator').fill('1');
  await page.getByLabel('kpi denominator').fill('250');
  await page.getByLabel('observed n').fill('250');
  await expect(page.getByTestId('readout-invalid')).toContainText('conflicts with its counts');
  await expect(page.getByTestId('readout-save')).toBeDisabled();
  const r = await request.post('/api/mutations/experiment', { data: { action: 'readout', id: 3, observed_value: 90, kpi_numerator: 1, kpi_denominator: 250, observed_n: 250, guardrail_observations: { abuse_pct: 1, visitor_cost_inr: 100 } } });
  expect(r.status()).toBe(400);
});

test('a citation with no matching tool call this turn is removed server-side (non-streamed modes); the valid citation stays rendered as verified', async ({ page }) => {
  await page.goto('/copilot');
  await page.getByLabel('Ask the Copilot').fill('show a stale citation');
  await page.getByRole('button', { name: 'Send' }).click();
  const msg = page.getByTestId('assistant-msg').last();
  await expect(msg).toContainText('[unverified citation removed]');
  await expect(msg).not.toContainText('[calculate');
  await expect(msg.getByTestId('citation')).toContainText('get_funnel');
});

test('shared-demo banner is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('shared-demo-banner')).toContainText('Shared demo');
  await expect(page.getByTestId('shared-demo-banner')).toContainText('Reset');
});

test.describe('mobile 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('Ask Copilot opens a usable full-screen sheet; it can be used and closed', async ({ page }) => {
    await page.goto('/?asOf=2025-04-20');
    await page.getByTestId('copilot-toggle').click();
    const panel = page.getByTestId('copilot-panel');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(388); expect(box.height).toBeGreaterThanOrEqual(800);
    const input = page.getByLabel('Ask the Copilot');
    await expect(input).toBeVisible();
    expect((await input.boundingBox())!.x + (await input.boundingBox())!.width).toBeLessThanOrEqual(391);
    await input.fill("What's our funnel?");
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('assistant-msg').last()).toContainText('2,050');
    await page.getByRole('button', { name: 'Close Copilot' }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByTestId('copilot-toggle')).toBeVisible(); // the trigger is never stranded
  });
  for (const path of ['/campaigns/C02', '/diagnose', '/execution', '/strategy']) {
    test(`${path} does not overflow the viewport horizontally`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); // not 'networkidle': the dev server's HMR socket can keep it busy
      await page.waitForTimeout(500); // let charts/tables lay out
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(w).toBeLessThanOrEqual(391);
    });
  }
  test('slides web preview is scaled to the screen', async ({ page }) => {
    await page.goto('/slides');
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w).toBeLessThanOrEqual(391);
  });
});
