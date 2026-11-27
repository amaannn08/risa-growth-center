import { expect, test } from '@playwright/test';

// COPILOT_MODE=mock (playwright.config): a fixed tool-call script, so e2e never hits DeepSeek.
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ request }) => { expect((await (await request.post('/api/admin/reset')).json()).ok).toBe(true); });

test('panel opens, answer shows Sources and the grounding chip', async ({ page }) => {
  await page.goto('/?asOf=2025-04-20');
  await page.getByTestId('copilot-toggle').click();
  await expect(page.getByTestId('copilot-panel')).toBeVisible();
  await page.getByLabel('Ask the Copilot').fill("What's our funnel?");
  await page.getByRole('button', { name: 'Send' }).click();
  const msg = page.getByTestId('assistant-msg').last();
  await expect(msg).toContainText('2,050');
  await expect(page.getByTestId('grounding').last()).toContainText('traced');
  await msg.getByRole('button', { name: /Sources/ }).click();
  await expect(page.getByTestId('sources').last()).toContainText('get_funnel');
});

test('draft card: confirm creates exactly one task visible on Execution', async ({ page }) => {
  await page.goto('/copilot');
  await page.getByLabel('Ask the Copilot').fill('Draft a reminder task for me');
  await page.getByRole('button', { name: 'Send' }).click();
  const card = page.getByTestId('draft-card').last();
  await expect(card).toContainText('needs your confirmation');
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(card).toContainText(/Task #\d+ created/);
  await page.goto('/execution');
  const task = page.getByTestId('col-todo').locator('[data-testid^="task-"]').filter({ hasText: 'Mock: reconfirmation reminder for confirmed registrants' });
  await expect(task).toHaveCount(1);
  const chip = task.getByTestId('evidence-chip');
  await expect(chip).toContainText(/registered_and_attended: 1,350 .*as of 2025-04-12, rev \d+/);
  await expect(chip).toContainText(/registered: 2,800 .*as of 2025-04-12, rev \d+/);
  await expect(chip).not.toContainText('unverified');
});

test('discarding a draft creates nothing', async ({ page, request }) => {
  await page.goto('/copilot');
  await page.getByLabel('Ask the Copilot').fill('Draft a task please');
  await page.getByRole('button', { name: 'Send' }).click();
  const card = page.getByTestId('draft-card').last();
  await card.getByRole('button', { name: 'Discard' }).click();
  await expect(card).toContainText('discarded');
  await page.goto('/execution');
  await expect(page.getByText('Mock: reconfirmation reminder')).toHaveCount(0);
});
