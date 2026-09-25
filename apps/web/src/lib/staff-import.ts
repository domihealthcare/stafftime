/**
 * Reads a staff list pasted from a spreadsheet.
 *
 * Copying cells out of Excel or Google Sheets gives tab-separated lines; a CSV
 * opened in a text editor gives commas. Either works. The first line must be
 * the column names, which are matched loosely ("Work email", "E-mail",
 * "Email address" are all the email), so a list made for something else can
 * usually be pasted as it is.
 *
 * Columns the app does not keep are named back and ignored — never stored.
 * That matters because a list kept for HR purposes may well have a social
 * security number or a date of birth on it, which this app deliberately does
 * not hold (see "Data this app does not hold" in CLAUDE.md).
 */
import type { JobRole, LocationSummary, Role } from './types';

export interface ImportedPerson {
  firstName: string;
  lastName: string;
  preferredName?: string;
  email: string;
  phone?: string;
  role: Role;
  payType: 'HOURLY' | 'SALARY';
  hireDate: string;
  adpFileNumber?: string;
  locationIds: string[];
  primaryLocationId?: string;
  jobRoleIds: string[];
}

export interface ImportRow {
  /// 1-based, counting the header as line 1, as a spreadsheet numbers it.
  line: number;
  person: ImportedPerson | null;
  /// Plain words, one per problem. A row with any is not added.
  problems: string[];
  /// Offices and job roles by name, for the preview.
  offices: string[];
  jobRoles: string[];
}

export interface ImportPreview {
  /// Column heading → what it was read as.
  used: { heading: string; field: string }[];
  ignored: string[];
  rows: ImportRow[];
  /// Something wrong with the paste as a whole, e.g. no email column.
  error: string | null;
}

type Field =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'preferredName'
  | 'email'
  | 'phone'
  | 'role'
  | 'payType'
  | 'hireDate'
  | 'adpFileNumber'
  | 'offices'
  | 'jobRoles';

const FIELD_NAMES: Record<Field, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  fullName: 'Name',
  preferredName: 'Goes by',
  email: 'Email',
  phone: 'Phone',
  role: 'Access',
  payType: 'Pay type',
  hireDate: 'Hire date',
  adpFileNumber: 'ADP File #',
  offices: 'Offices',
  jobRoles: 'Job roles',
};

/// Headings, lower-cased with everything but letters and digits dropped.
const HEADINGS: [Field, string[]][] = [
  ['firstName', ['firstname', 'first', 'givenname', 'forename']],
  ['lastName', ['lastname', 'last', 'surname', 'familyname']],
  ['fullName', ['name', 'fullname', 'employee', 'employeename', 'staffname']],
  ['preferredName', ['preferredname', 'goesby', 'nickname', 'knownas']],
  ['email', ['email', 'emailaddress', 'workemail', 'workemailaddress', 'companyemail']],
  ['phone', ['phone', 'phonenumber', 'mobile', 'cell', 'cellphone', 'mobilephone', 'workphone']],
  ['role', ['access', 'accesslevel', 'approle', 'permission', 'permissions', 'userrole']],
  ['payType', ['paytype', 'pay', 'hourlysalary', 'salaryhourly', 'flsa', 'paybasis']],
  ['hireDate', ['hiredate', 'startdate', 'datehired', 'dateofhire', 'hired', 'started']],
  ['adpFileNumber', ['adpfile', 'adpfilenumber', 'fileno', 'filenumber', 'adp', 'adpid']],
  ['offices', ['office', 'offices', 'location', 'locations', 'site', 'sites', 'worksat']],
  [
    'jobRoles',
    ['jobrole', 'jobroles', 'position', 'positions', 'title', 'jobtitle', 'role', 'roles', 'department'],
  ],
];

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/// Short names the practice uses, for offices and job roles.
const OFFICE_ALIASES: Record<string, string> = {
  nb: 'northbergen',
  wny: 'westnewyork',
  westny: 'westnewyork',
};
const ROLE_ALIASES: Record<string, string> = {
  ma: 'medicalassistant',
  mas: 'medicalassistant',
  fd: 'frontdesk',
  frontdeskreceptionist: 'frontdesk',
  receptionist: 'frontdesk',
  receptionists: 'frontdesk',
  admin: 'administrative',
  administration: 'administrative',
  doctor: 'provider',
  physician: 'provider',
  md: 'provider',
  do: 'provider',
  np: 'provider',
  nursepractitioner: 'provider',
  pa: 'provider',
  providers: 'provider',
  officemanager: 'manager',
  practicemanager: 'manager',
};

function splitLine(line: string, separator: string): string[] {
  if (separator === '\t') return line.split('\t').map((cell) => cell.trim());
  // Commas, honouring "quoted, cells" as a spreadsheet writes them.
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      cells.push(cell.trim());
      cell = '';
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

/// A list inside one cell: "North Bergen, West New York", "FD / MA", "A & B".
function splitList(value: string): string[] {
  return value
    .split(/\s*(?:,|\/|&|;|\+|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/// ISO, US month/day/year with 2- or 4-digit years, or a spreadsheet's
/// "March 1, 2024". Returns YYYY-MM-DD, or null.
export function readDate(value: string): string | null {
  const text = value.trim();
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? `${y}-${pad(m)}-${pad(d)}`
      : null;
  };
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) return valid(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (match) {
    let year = Number(match[3]);
    if (match[3].length === 2) year += year > 50 ? 1900 : 2000;
    return valid(year, Number(match[1]), Number(match[2]));
  }
  const parsed = Date.parse(text);
  if (/[a-z]/i.test(text) && !Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return valid(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
  return null;
}

export function readStaffList(
  text: string,
  offices: LocationSummary[],
  jobRoles: Pick<JobRole, 'id' | 'name'>[],
  existingEmails: string[],
): ImportPreview {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const headerIndex = lines.findIndex((line) => line.trim() !== '');
  const empty: ImportPreview = { used: [], ignored: [], rows: [], error: null };
  if (headerIndex === -1) return empty;

  const separator = lines[headerIndex].includes('\t') ? '\t' : ',';
  const headings = splitLine(lines[headerIndex], separator);
  const columns = new Map<Field, number>();
  const used: ImportPreview['used'] = [];
  const ignored: string[] = [];
  headings.forEach((heading, index) => {
    const key = squash(heading);
    const match = HEADINGS.find(
      ([field, names]) => names.includes(key) && !columns.has(field),
    );
    if (match && key) {
      columns.set(match[0], index);
      used.push({ heading, field: FIELD_NAMES[match[0]] });
    } else if (heading) {
      ignored.push(heading);
    }
  });

  const hasName =
    columns.has('fullName') || (columns.has('firstName') && columns.has('lastName'));
  if (!columns.has('email') || !hasName) {
    return {
      ...empty,
      used,
      ignored,
      error:
        'The first line should be the column names, with at least a name (or First name and Last name) and an Email column.',
    };
  }

  const officeByKey = new Map<string, LocationSummary>();
  for (const office of offices) {
    officeByKey.set(squash(office.name), office);
    officeByKey.set(squash(office.slug), office);
  }
  const roleByKey = new Map(jobRoles.map((role) => [squash(role.name), role]));
  const taken = new Set(existingEmails.map((email) => email.toLowerCase()));
  const inThisList = new Map<string, number>();

  const rows: ImportRow[] = [];
  lines.forEach((line, index) => {
    if (index <= headerIndex || line.trim() === '') return;
    const cells = splitLine(line, separator);
    if (cells.every((cell) => cell === '')) return;
    const cell = (field: Field) => {
      const at = columns.get(field);
      return at === undefined ? '' : (cells[at] ?? '').trim();
    };
    const problems: string[] = [];

    let firstName = cell('firstName');
    let lastName = cell('lastName');
    if ((!firstName || !lastName) && cell('fullName')) {
      const full = cell('fullName');
      if (full.includes(',')) {
        // "Doe, Jane", as payroll lists often have it.
        const [last, first] = full.split(',').map((part) => part.trim());
        firstName ||= first ?? '';
        lastName ||= last ?? '';
      } else {
        const parts = full.split(/\s+/);
        lastName ||= parts.length > 1 ? parts.pop()! : '';
        firstName ||= parts.join(' ');
      }
    }
    if (!firstName || !lastName) problems.push('Needs a first and a last name');

    const email = cell('email').toLowerCase();
    if (!email) problems.push('No email');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`"${email}" is not an email`);
    else if (taken.has(email)) problems.push('Already in the app');
    else if (inThisList.has(email)) problems.push(`Same email as line ${inThisList.get(email)}`);
    if (email) inThisList.set(email, index + 1);

    const phone = cell('phone');
    if (phone && phone.replace(/\D/g, '').length < 7) problems.push(`"${phone}" is not a phone number`);

    const hireText = cell('hireDate');
    const hireDate = hireText ? readDate(hireText) : null;
    if (!hireText) problems.push('No hire date');
    else if (!hireDate) problems.push(`Cannot read the hire date "${hireText}" — use 3/1/2024`);

    const accessText = squash(cell('role'));
    let role: Role = 'EMPLOYEE';
    if (accessText === 'admin' || accessText === 'administrator') role = 'ADMIN';
    else if (accessText === 'manager') role = 'MANAGER';
    else if (accessText && !['employee', 'staff', 'user', 'standard'].includes(accessText)) {
      problems.push(`Access "${cell('role')}" should be Employee, Manager or Admin`);
    }

    const payText = squash(cell('payType'));
    let payType: 'HOURLY' | 'SALARY' = 'HOURLY';
    if (['salary', 'salaried', 'exempt'].includes(payText)) payType = 'SALARY';
    else if (payText && !['hourly', 'nonexempt'].includes(payText)) {
      problems.push(`Pay type "${cell('payType')}" should be Hourly or Salaried`);
    }

    const adp = cell('adpFileNumber');
    if (adp && !/^[A-Za-z0-9]{1,10}$/.test(adp)) {
      problems.push(`ADP File # "${adp}" should be letters and numbers only, 10 at most`);
    }

    const officeText = cell('offices');
    const matchedOffices: LocationSummary[] = [];
    if (/^(both|all|either)$/i.test(officeText.trim())) matchedOffices.push(...offices);
    else {
      for (const name of splitList(officeText)) {
        const key = squash(name);
        const office = officeByKey.get(OFFICE_ALIASES[key] ?? key);
        if (!office) problems.push(`No office called "${name}"`);
        else if (!matchedOffices.includes(office)) matchedOffices.push(office);
      }
    }
    if (matchedOffices.length === 0 && !problems.some((p) => p.startsWith('No office'))) {
      problems.push('No office — which one do they work at?');
    }

    const matchedRoles: Pick<JobRole, 'id' | 'name'>[] = [];
    for (const name of splitList(cell('jobRoles'))) {
      const key = squash(name);
      const jobRole = roleByKey.get(ROLE_ALIASES[key] ?? key) ?? roleByKey.get(key.replace(/s$/, ''));
      if (!jobRole) problems.push(`No job role called "${name}"`);
      else if (!matchedRoles.includes(jobRole)) matchedRoles.push(jobRole);
    }

    const preferredName = cell('preferredName');
    rows.push({
      line: index + 1,
      problems,
      offices: matchedOffices.map((office) => office.name),
      jobRoles: matchedRoles.map((jobRole) => jobRole.name),
      person:
        problems.length > 0
          ? null
          : {
              firstName,
              lastName,
              preferredName: preferredName || undefined,
              email,
              phone: phone || undefined,
              role,
              payType,
              hireDate: hireDate!,
              adpFileNumber: adp || undefined,
              locationIds: matchedOffices.map((office) => office.id),
              // The first office named is where they mostly work.
              primaryLocationId: matchedOffices[0]?.id,
              jobRoleIds: matchedRoles.map((jobRole) => jobRole.id),
            },
    });
  });

  return { used, ignored, rows, error: null };
}
