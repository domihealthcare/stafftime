import type { ClosingItemKind } from '@prisma/client';

/**
 * The closing checklists the practice started with — Front Desk Checklist 2026
 * and Medical Assistant Responsibilities, as sent by Dominguez in September
 * 2026, worded lightly for a phone screen. From here on they are the managers'
 * to edit in the app; this is only the starting point, written once into a new
 * database (by the seed) and into the live one (by the migration that
 * introduced them).
 *
 * Standing rules ("notify the doctor if vitals are out of range") are
 * reminders, not ticks — decided with Dominguez. The two call counts are
 * numbers, with "calls answered" flagged below 20.
 */
export interface DefaultItem {
  kind: ClosingItemKind;
  text: string;
  target?: number;
  /// ISO weekdays, 1 = Monday.
  weekdays?: number[];
  /// A location slug, for items that only apply at one office.
  location?: string;
}

export interface DefaultSection {
  title: string;
  isPosition?: boolean;
  items: DefaultItem[];
}

const task = (text: string, extra: Partial<DefaultItem> = {}): DefaultItem => ({
  kind: 'TASK',
  text,
  ...extra,
});
const reminder = (text: string): DefaultItem => ({ kind: 'REMINDER', text });
const supply = (text: string): DefaultItem => ({ kind: 'SUPPLY', text });

export const DEFAULT_CHECKLISTS: Record<string, DefaultSection[]> = {
  'Front Desk': [
    {
      title: 'Check In Desk',
      isPosition: true,
      items: [
        task(
          'Checked each patient in: insurance active, copay collected correctly, PCP is JD/CI/JB — noted under insurance notes (e.g. “Active via ECW +PCP(DOM) 04/01/26 KB”)',
        ),
        task(
          'Scanned for every patient: photo ID, insurance card (front & back), new patient forms',
        ),
        task('“Homework” done: Needs Appt / Inform/Normal / Action Needed'),
        task('Patient waitlist reviewed and cleaned up'),
        task('Copayments organized for submission'),
        task(
          'Next-day insurances confirmed for NB / WNY providers: name in its acronym version, active, copay, under the correct PCP',
        ),
      ],
    },
    {
      title: 'Outdesk',
      isPosition: true,
      items: [
        task(
          'All voicemails and texts from the previous day returned (checked morning and before close)',
        ),
        task('Referral information provided — ECW Referral section read'),
        task('Follow-up appointments scheduled per the provider’s instructions'),
        task(
          'Tomorrow’s representative lunch confirmed — rep messaged with the time, place and provider they will see',
        ),
        task('“Homework” done: Needs Appt / Inform/Normal / Action Needed'),
      ],
    },
    {
      title: 'Everyone',
      items: [
        reminder(
          'Answer incoming calls. Never leave a patient on hold longer than 1 minute. With a patient in front of you, do not answer — silence the call if needed, but do NOT lower the call volume.',
        ),
        task('TVs and scanners powered off'),
        task('Enough forms available (e.g. new patient forms, flu consent forms)'),
        task(
          'Any office supplies needed reported to a Manager/Lead (e.g. computer paper, snacks, sticky notes)',
        ),
        { kind: 'COUNT', text: 'Calls answered', target: 20 },
        { kind: 'COUNT', text: 'Calls placed' },
      ],
    },
  ],
  'Medical Assistant': [
    {
      title: 'Check In',
      items: [
        reminder('Follow the procedures of the office you are working at.'),
        task('All next-day appointments confirmed'),
        task('All test results taken from the “Pending Appts” folder for the date of service'),
        task('Pre-charted: last imaging/lab orders checked, results located through the portals'),
      ],
    },
    {
      title: 'During shift',
      items: [
        reminder('If vitals are out of the normal range, notify the doctor immediately.'),
        reminder('Glucose check for diabetic patients only.'),
        reminder('Sanitize before and after using an examination room or equipment.'),
        task(
          'Every nursing visit’s superbill completed and given to the doctor once the note was done',
        ),
        task('Pharmacy added/confirmed for all patients'),
        task('ABI / PFT / EKG / rapid test / urine dipstick printouts uploaded to the chart'),
      ],
    },
    {
      title: 'Before checking out',
      items: [
        task('Otoscope tips, band-aids, referral pads, etc. refilled in each examination room'),
        task('Trash taken out', { weekdays: [2, 4], location: 'north-bergen' }),
        task('Forms reprinted: New Patient Forms, HIPAA, PHQ9, AWV, Advance Directive'),
        task('EKG left plugged in'),
        task('Thermometer on ECO mode', { location: 'north-bergen' }),
      ],
    },
    {
      title: 'Inventory — tick anything we need more of',
      items: [
        'Albuterol',
        'Pregnancy Test',
        'Alcohol Prep Pad',
        'Large Paper Tape',
        'Alcohol Isopropyl 70% Solution',
        'Peroxide',
        'Blood Glucose Test Strip 50/Bx',
        'Rapid Flu Kit',
        'BD Veritor Sars-CoV-2 Test Kit',
        'Speculum Vaginal S/M/L',
        'Bandage Strips Plastic 1x3"',
        'Safety Lancets 21 gauge',
        'B-12 Injection',
        'Sani Cloth Disposable Wipe',
        'Blue Chucks',
        'Tongue Depressor Wood',
        'Bacitracin Zinc',
        'Towelettes',
        'Cytobrush',
        'Table Paper 21 in',
        'Drape Sheet 72 in White',
        'ThinPrep',
        'Electrode Resting Tab',
        'Urinalysis Test Strip 11 Way',
        'Gown Mauve/Pink 50/Ca',
        'Wallach Papette',
        'Gloves S/M/L',
        '25G x 1" Hypodermic Needle',
        'Hologic Aptima',
        '4.2 Single Use Specula',
        'Ketorolac 30mg',
        '6" Cotton Tip Applicator',
        'Kenalog-40 Injection',
        '3mL 25G x 1" Syringe',
        'Lubricating Jelly',
        'PPD Tuberculin Injection',
        'Lidocaine',
        'Electrodes',
      ].map(supply),
    },
  ],
};
