// Clocking out from the Clock screen, for suites that are not about closing
// checklists. Front Desk and Medical Assistant staff get their checklist first
// (September 2026); this takes the "without the checklist" way through it, so
// those suites go on testing what they are about. closing.mjs tests the
// checklist itself.
export async function clockOut(page, { timeout = 10000, onChecklist } = {}) {
  await page.getByRole('button', { name: /^Clock out$/ }).click({ timeout });
  const form = page.getByTestId('closing-form');
  const shown = await form
    .waitFor({ timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    if (onChecklist) await onChecklist(form);
    await form.getByRole('button', { name: 'Clock out without the checklist' }).click();
  }
}
