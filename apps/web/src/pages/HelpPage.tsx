import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useIsManager } from '../lib/session';
import { PASSWORD_RULE } from '../lib/password';
import { PageHeading } from '../components/ui';

interface Topic {
  question: string;
  answer: ReactNode;
}

interface Section {
  title: string;
  topics: Topic[];
}

/// A screen name, set the way it appears in the app so it can be spotted.
function Screen({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>;
}

const STAFF: Section[] = [
  {
    title: 'Clocking in and out',
    topics: [
      {
        question: 'How do I clock in on my phone?',
        answer: (
          <>
            <p>
              Open <Screen>Clock</Screen> and press the big button. The first time, your phone asks
              whether the app may use your location — say yes. It checks you are at one of your
              offices, and only at the moment you press the button.
            </p>
            <p>
              If you are on the office wi-fi, that can count instead of your location.
            </p>
          </>
        ),
      },
      {
        question: 'How do I use the front-desk tablet?',
        answer: (
          <p>
            Tap your name, type your four-digit PIN, and it clocks you in or out. The tablet only
            shows the people who work at that office. If you have forgotten your PIN, ask a manager
            — do not share somebody else's.
          </p>
        ),
      },
      {
        question: 'It will not let me clock in. What now?',
        answer: (
          <>
            <p>The message on the screen says why. The usual reasons:</p>
            <ul>
              <li>
                <strong>Location blocked</strong> — allow location for this site in your phone's
                browser settings, then try again.
              </li>
              <li>
                <strong>Too far away</strong> — you need to be at the office. Indoors the phone's
                position can be poor; step near a window, or use the front-desk tablet.
              </li>
              <li>
                <strong>Not assigned to this office</strong> — a manager can add you.
              </li>
            </ul>
            <p>If you still cannot, use the tablet and tell a manager so they know.</p>
          </>
        ),
      },
      {
        question: 'I forgot to clock out.',
        answer: (
          <p>
            Tell a manager. They correct the time, and the correction is recorded with a reason so
            nobody has to remember later why it changed. You cannot change your own punches.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Your hours and schedule',
    topics: [
      {
        question: 'Where do I see my hours?',
        answer: (
          <p>
            <Screen>Timesheet</Screen> shows every punch and the total. Use the shortcuts along the
            top — this week, last week, this or last pay period, this or last month — or{' '}
            <strong>Custom</strong> to pick any two dates. The arrows step back and forward a period
            at a time. Pay is every two weeks.
          </p>
        ),
      },
      {
        question: 'What do the flags on my timesheet mean?',
        answer: (
          <ul>
            <li>
              <strong>Late</strong> — clocked in more than five minutes after your shift started.
            </li>
            <li>
              <strong>Left early</strong> — clocked out more than five minutes before it ended.
            </li>
            <li>
              <strong>Missing punch</strong> — there is a clock-in with no clock-out.
            </li>
            <li>
              <strong>Edited</strong> — a manager corrected it; the reason is shown underneath.
            </li>
          </ul>
        ),
      },
      {
        question: 'When am I working?',
        answer: (
          <p>
            <Screen>Schedule</Screen> shows your shifts by week or by month. To have them appear in
            Google, Apple or Outlook calendar, use the calendar link on that screen — it keeps
            itself up to date. Treat the link like a password: anyone who has it can see your
            shifts.
          </p>
        ),
      },
      {
        question: 'How do I say when I cannot work?',
        answer: (
          <p>
            Open <Screen>Schedule</Screen> → <strong>When you can’t work</strong>. Add a weekday you are never free (all day or between two times), or a single date. Nobody
            has to approve it. It only affects weeks whose schedule has not been published yet — a
            published week is fixed, so for a date inside one, talk to your manager or ask for time
            off.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Time off',
    topics: [
      {
        question: 'How do I ask for time off?',
        answer: (
          <p>
            Open <Screen>Time off</Screen>, choose the type and the dates, and send it. Your
            balance is shown on the same screen. You get an email when a manager decides, with
            their reason if they give one.
          </p>
        ),
      },
    ],
  },
  {
    title: 'The team',
    topics: [
      {
        question: 'Where is the practice news?',
        answer: (
          <p>
            The most important post is at the top of <Screen>Clock</Screen> when you sign in. All
            posts are under <Screen>Team → News</Screen>, newest first.
          </p>
        ),
      },
      {
        question: 'How do I find a colleague?',
        answer: (
          <p>
            <Screen>Team → Directory</Screen> lists everybody with their work email, phone number,
            job roles and offices. <strong>In now</strong> means they are clocked in at the moment.
            Each job role has its own colour, so you can tell at a glance who is front desk, MA or
            provider.
          </p>
        ),
      },
      {
        question: 'Where are the links and guides for my job?',
        answer: (
          <p>
            <Screen>Team → Resources</Screen>. You see the resources for everyone, plus those for
            each of your job roles.
          </p>
        ),
      },
      {
        question: 'Are surveys really anonymous?',
        answer: (
          <>
            <p>
              Yes. Your answers are saved with no name and no time on them, so nobody — managers
              and admins included — can tell who said what. The app does note, separately, that
              you have taken part, so you cannot answer twice.
            </p>
            <p>
              Results only appear once a survey is closed and at least three people have answered.
              The <strong>suggestion box</strong> on <Screen>Team → Surveys</Screen> is always open
              and keeps only your message and the day it arrived.
            </p>
          </>
        ),
      },
    ],
  },
  {
    title: 'Your account',
    topics: [
      {
        question: 'How do I change my password?',
        answer: (
          <p>
            Open the menu under your name → <strong>Change password</strong>. {PASSWORD_RULE}{' '}
            Avoid anything easy to guess, like the practice name or your own.
          </p>
        ),
      },
      {
        question: 'I have forgotten my password.',
        answer: (
          <p>
            Press <strong>Forgotten your password?</strong> on the sign-in screen and a link is
            emailed to your work address. If nothing arrives, a manager can give you a temporary
            one.
          </p>
        ),
      },
      {
        question: 'I used a shared computer.',
        answer: (
          <p>
            Sign out when you are done — menu under your name → <strong>Sign out</strong>. The
            front-desk tablet does not need this: it never signs anybody in.
          </p>
        ),
      },
      {
        question: 'What does the app keep about me?',
        answer: (
          <p>
            Your name, contact details, job roles, offices, shifts, punches and time off. Where you
            were when you clocked in on your phone is kept for 90 days and then deleted; it is not
            shown on timesheets. It holds no social security number, no ID numbers and no personnel
            documents — those stay in your personnel file.
          </p>
        ),
      },
    ],
  },
];

const MANAGERS: Section[] = [
  {
    title: 'Hours and payroll',
    topics: [
      {
        question: 'How do I approve hours?',
        answer: (
          <p>
            <Screen>Timesheet</Screen> shows everybody's punches. Press <strong>Approve</strong> on
            each one that is right. Flagged entries — late, left early, missing punch — are worth
            a look first. The banner at the top lists what is still unapproved.
          </p>
        ),
      },
      {
        question: 'How do I fix a punch?',
        answer: (
          <p>
            Press <strong>Correct</strong>, change the time and give a reason. The reason is shown
            to the employee and kept, so a disputed payslip can be settled by looking. If the hours
            have already gone to payroll the app stops you and asks you to confirm; the correction
            is then flagged until a later export picks it up.
          </p>
        ),
      },
      {
        question: 'How do I run payroll?',
        answer: (
          <>
            <p>
              <Screen>Manage → Export</Screen> opens on the last pay period. Check the summary —
              it says how many entries are flagged — then download the Excel file and upload it to
              payroll. Save the columns you use as a report so next time is one tap.
            </p>
            <p>
              Every export is kept under <strong>Past exports</strong>, with the file exactly as it
              went out. The ADP TotalSource format is waiting on details from ADP; until then use
              the spreadsheet.
            </p>
          </>
        ),
      },
    ],
  },
  {
    title: 'The schedule',
    topics: [
      {
        question: 'How do I build next week?',
        answer: (
          <ul>
            <li>
              <strong>Copy last week</strong> when most weeks look the same, then adjust.
            </li>
            <li>
              <strong>Repeating shifts</strong> makes, say, every Tuesday and Thursday for a month
              in one go.
            </li>
            <li>
              Add single shifts on the week grid. <strong>Coverage</strong> shows hours per day,
              who is away and any day with nobody on.
            </li>
          </ul>
        ),
      },
      {
        question: 'What do the warnings mean?',
        answer: (
          <p>
            <strong>Overtime</strong> — the rota puts somebody past the weekly threshold (40 hours,
            across both offices). <strong>Unavailable</strong> — the shift lands on time they have
            said they cannot work. Both are warnings: the shift is still saved, and you decide.
          </p>
        ),
      },
      {
        question: 'When should the schedule be published?',
        answer: (
          <p>
            Before staff can rely on it — and once a week is published, staff can no longer change
            their availability for it. The app chases an unpublished week four days before it
            starts; an admin can change that under Practice settings.
          </p>
        ),
      },
      {
        question: 'Can I see who is free?',
        answer: (
          <p>
            <Screen>Schedule</Screen> → <strong>Availability — yours and the team’s</strong> lists
            what everybody has said they cannot work. You can read it but not change it — it is
            theirs.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Time off, checklists and licences',
    topics: [
      {
        question: 'How do I decide a time-off request?',
        answer: (
          <p>
            The <Screen>Time off</Screen> tab shows a count of what is waiting. Each request shows
            what is already scheduled in those dates before you decide. Approving does not cancel
            shifts — the coverage strip flags the clash, and you reassign cover.
          </p>
        ),
      },
      {
        question: 'Starting or leaving',
        answer: (
          <p>
            <Screen>Checklists</Screen> tracks each step for a new hire or a leaver — who did it and
            when. The paperwork itself stays in the personnel file; nothing is uploaded here.
          </p>
        ),
      },
      {
        question: 'Licence renewals',
        answer: (
          <p>
            <Screen>Licences</Screen> opens on what lapses in the next 60 days. Record the expiry
            date only; press <strong>Renew</strong> to put in the new date.
          </p>
        ),
      },
    ],
  },
  {
    title: 'The team',
    topics: [
      {
        question: 'How are things going this week?',
        answer: (
          <p>
            <Screen>Manage → Dashboard</Screen>: hours worked against scheduled, overtime, late
            clock-ins and time off, with a chart per location, and — looking ahead — shifts in the
            next two weeks that clash with somebody's availability or push them into overtime.
          </p>
        ),
      },
      {
        question: 'Job roles and their colours',
        answer: (
          <p>
            <Screen>Manage → Job roles</Screen>. Add, rename or remove roles, choose each one's
            colour, and put people in them — somebody can be in several. A job role decides which
            resources somebody sees, and nothing else: being in "Manager" gives no extra power in
            the app.
          </p>
        ),
      },
      {
        question: 'Adding resources',
        answer: (
          <p>
            On <Screen>Team → Resources</Screen>, add a link (Drive, ADP, a vendor portal) or write
            a page, for everyone or for one job role. There are no uploads.
          </p>
        ),
      },
      {
        question: 'Running a survey',
        answer: (
          <p>
            On <Screen>Team → Surveys</Screen>, write the questions (1–5 rating, pick one, or a
            written answer) and choose who it is for: everyone, a job role or a location. You see
            how many have answered, never who. Results appear once you close it, and only if at
            least three people answered — ask a small group and there may be nothing to show.
          </p>
        ),
      },
      {
        question: 'What needs a look?',
        answer: (
          <p>
            Banners on each screen list what needs attention there — unapproved hours, missing
            punches, lapsing licences, next week unpublished, and so on. The same list is emailed
            each night; turn that off under the menu → <strong>Notifications</strong>.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Admins only',
    topics: [
      {
        question: 'Staff, kiosks and offices',
        answer: (
          <ul>
            <li>
              <Screen>Manage → Staff</Screen> — add people, set their access (Employee, Manager or
              Admin), offices and PIN, and issue a temporary password.
            </li>
            <li>
              <Screen>Manage → Kiosks</Screen> — pair a front-desk tablet to an office.
            </li>
            <li>
              <Screen>Manage → Locations</Screen> — the office addresses, the geofence and office
              network. Stand at the front desk and press <strong>Use my current location</strong>{' '}
              to set the pin.
            </li>
          </ul>
        ),
      },
      {
        question: 'Practice settings',
        answer: (
          <p>
            Under the menu → <strong>Practice settings</strong>: the overtime threshold, how early
            an unpublished week is chased, and the <strong>pay period start</strong> — the first day
            of any one pay period. The pay-period shortcuts stay greyed out until it is set.
          </p>
        ),
      },
      {
        question: 'Announcements',
        answer: (
          <p>
            On <Screen>Team → News</Screen>, write, edit or remove posts. One post is always the
            primary one shown at the top of everybody's home screen; tick another to move it.
          </p>
        ),
      },
    ],
  },
];

/**
 * How to use the app, written for the people using it rather than for us.
 *
 * Two guides: one everybody gets, and one for managers and admins. They are
 * plain text in the bundle rather than pages in the database, so they ship
 * with the feature they describe and cannot drift from it between releases.
 */
export function HelpPage() {
  const isManager = useIsManager();
  const [params, setParams] = useSearchParams();
  const guide = isManager && params.get('guide') === 'managers' ? 'managers' : 'staff';
  const sections = guide === 'managers' ? MANAGERS : STAFF;

  const tab = (key: 'staff' | 'managers', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={guide === key}
      onClick={() => setParams(key === 'staff' ? {} : { guide: key }, { replace: true })}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        guide === key
          ? 'bg-brand-600 text-white'
          : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Help"
        subtitle="How to do the everyday things. Stuck on something not covered here? Ask a manager."
      />

      {isManager && (
        <div role="tablist" aria-label="Guide" className="mb-6 flex gap-2">
          {tab('staff', 'For everyone')}
          {tab('managers', 'For managers')}
        </div>
      )}

      <div role={isManager ? 'tabpanel' : undefined} className="space-y-8">
        {sections.map((section) => (
          <section key={section.title} aria-labelledby={slug(section.title)}>
            <h2
              id={slug(section.title)}
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500"
            >
              {section.title}
            </h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {section.topics.map((topic) => (
                <details key={topic.question} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50">
                    {topic.question}
                    <span
                      aria-hidden="true"
                      className="text-slate-400 transition group-open:rotate-90"
                    >
                      ›
                    </span>
                  </summary>
                  <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-slate-700 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
                    {topic.answer}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {!isManager && (
        <p className="mt-8 text-sm text-slate-500">
          Something not working? <Link to="/" className="font-medium text-brand-700 underline">Back to Clock</Link>{' '}
          and tell a manager what the screen said.
        </p>
      )}
    </div>
  );
}

function slug(text: string): string {
  return `help-${text.toLowerCase().replace(/[^a-z]+/g, '-')}`;
}
