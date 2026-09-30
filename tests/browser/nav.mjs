// Opening a top-bar menu (Team, Manage) the way a person does on either
// layout. On a laptop they sit in the header; on a phone they are inside the
// bottom bar's More sheet, so More is opened first.
export async function openMore(page) {
  const more = page.getByRole('button', { name: 'More', exact: true });
  if (await more.isVisible().catch(() => false)) {
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  }
}

export async function openMenu(page, name) {
  await openMore(page);
  await page.getByRole('button', { name, exact: true }).click();
}

// The Regular shifts list stays hidden until asked for; open it if it is not.
export async function showRegularShifts(page) {
  const list = page.getByTestId('standing-shift').first();
  if (await list.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: /^Show the \d+ regular shifts?$/ }).click();
}
