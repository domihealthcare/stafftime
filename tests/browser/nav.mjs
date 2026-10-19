// Getting around the way a person does on either layout (October 2026: Home,
// Schedule, Timesheet, Directory and Resources in the laptop header, Manage a
// menu beside them; on a phone Home, Schedule, Directory and Resources along
// the bottom and the rest - Timesheet, News, Surveys, Manage - under More).
export async function openMore(page) {
  const more = page.getByRole('button', { name: 'More', exact: true });
  if (await more.isVisible().catch(() => false)) {
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  }
}

/// Opens the Manage menu (on a phone, inside More).
export async function openMenu(page, name) {
  await openMore(page);
  await page.getByRole('button', { name, exact: true }).click();
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/// The navigation link for a screen, opening More and then Manage if that is
/// where it is. `name` is the start of the link's words (a badge may follow),
/// or a RegExp.
export async function navLink(page, name) {
  const pattern = typeof name === 'string' ? new RegExp(`^${escape(name)}`) : name;
  const find = () => page.getByRole('navigation').getByRole('link', { name: pattern }).first();
  if (await find().isVisible().catch(() => false)) return find();
  await openMore(page);
  if (await find().isVisible().catch(() => false)) return find();
  const manage = page.getByRole('button', { name: 'Manage', exact: true });
  if (await manage.isVisible().catch(() => false)) {
    if ((await manage.getAttribute('aria-expanded')) !== 'true') await manage.click();
  }
  return find();
}

/// Clicks through to a screen from the navigation.
export async function goTo(page, name) {
  await (await navLink(page, name)).click();
}

/// News has no tab on a laptop (October 2026): it is on Home, with All news.
export async function openNews(page) {
  await goTo(page, 'Home');
  await page.getByTestId('home-news').getByRole('link', { name: /All news/ }).click();
  await page.getByRole('heading', { name: 'News', exact: true }).waitFor({ timeout: 15000 });
}

/// Time off has no tab of its own (October 2026): everybody reaches the Time
/// off screen from the card on the Schedule.
export async function openTimeOff(page) {
  await goTo(page, 'Schedule');
  await page.getByTestId('your-time-off').getByRole('link', { name: /All your time off|All requests/ }).click();
  await page.waitForURL(/\/time-off/, { timeout: 15000 });
}

// The Regular shifts list stays hidden until asked for; open it if it is not.
export async function showRegularShifts(page) {
  const list = page.getByTestId('standing-shift').first();
  if (await list.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: /^Show the \d+ regular shifts?$/ }).click();
}

/// Presses one of the Export screen's Download buttons and, when "Before you
/// export" comes up first (October 2026), answers Export anyway - so suites
/// about the file itself get the file.
export async function pressDownload(page, name) {
  await page.getByRole('button', { name }).click();
  // Either the pop-up opens, or the check found nothing and the file is on its way.
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="export-check"]') ||
      ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Checking…'),
    null,
    { timeout: 15000 },
  );
  const check = page.getByTestId('export-check');
  if (await check.count()) await check.getByRole('button', { name: 'Export anyway' }).click();
}

/// Manage groups its screens under five headings (October 2026, Dominguez:
/// "cut down the manage options"): each heading opens its first screen, with
/// a strip of tabs to the rest.
export const SECTION_OF = {
  Dashboard: 'Dashboard',
  Staff: 'People',
  'Job roles': 'People',
  Licenses: 'People',
  'Onboarding & Offboarding': 'People',
  'Provider productivity': 'People',
  Locations: 'Offices',
  Kiosks: 'Offices',
  'Closing checklists': 'Offices',
  Reps: 'Offices',
  Surveys: 'Surveys & reading',
  'Required reading': 'Surveys & reading',
  Export: 'Money',
  Reimbursements: 'Money',
  'Vendor payments': 'Money',
};

/// Opens one of Manage's screens the way a person does: Manage, its heading,
/// then the tab (on a phone, Manage is inside More).
export async function goToManage(page, label) {
  const section = SECTION_OF[label];
  if (!section) throw new Error(`${label} is not a Manage screen`);
  await openMenu(page, 'Manage');
  await page.getByRole('navigation').getByRole('link', { name: section, exact: true }).first().click();
  if (section !== label) {
    await page.getByRole('navigation', { name: `${section} screens` }).getByRole('link', { name: label, exact: true }).click();
  }
}
