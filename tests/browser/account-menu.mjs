// Everything personal — settings, notifications, password, sign out — lives
// behind the account button in the top right. A suite that wants one of those
// has to open the menu first, the same as a person does.

/// Opens the account menu if it is not already open.
export async function openAccountMenu(page) {
  if ((await page.getByRole('menuitem').count()) > 0) return;
  await page.getByRole('button', { name: /Your account/ }).click();
  await page.getByRole('menu').waitFor({ timeout: 10000 });
}

/// Opens the menu and picks an item by its visible name.
export async function pickFromAccountMenu(page, name) {
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name }).click();
}

/// Whether the menu offers an item — for checking that an employee is not
/// shown a manager's screens. Leaves the menu open, as it found it closed.
export async function accountMenuHas(page, name) {
  await openAccountMenu(page);
  return (await page.getByRole('menuitem', { name }).count()) > 0;
}
