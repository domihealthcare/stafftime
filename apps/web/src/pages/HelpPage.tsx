import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { canUseCarePlan, canUseWellnessForm } from '../lib/clinical-access';
import { useIsManager, useSession } from '../lib/session';
import { PASSWORD_RULE } from '../lib/password';
import { PageHeading } from '../components/ui';
import { VersionCard } from '../components/VersionCard';

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
              Open <Screen>Home</Screen> and press the big button. The first time, your phone asks
              whether the app may use your location — say yes. It checks you are at one of your
              offices, and only at the moment you press the button.
            </p>
            <p>If you are on the office wi-fi, that can count instead of your location.</p>
          </>
        ),
      },
      {
        question: 'Put Domi Staff on your phone',
        answer: (
          <>
            <p>
              It can sit on your home screen like any other app, and opens straight to it, full
              screen. There is nothing to download from an app store.
            </p>
            <p>
              <strong>iPhone, in Safari:</strong> open {window.location.host}, tap{' '}
              <strong>Share</strong> (the square with an arrow, at the bottom), scroll down and tap{' '}
              <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </p>
            <p>
              <strong>iPhone, in Chrome:</strong> open {window.location.host}, tap{' '}
              <strong>Share</strong> in the address bar at the top (on older versions,{' '}
              <strong>⋯</strong> at the bottom right, then <strong>Share</strong>), then{' '}
              <strong>Add to Home Screen</strong> and <strong>Add</strong>.
            </p>
            <p>
              <strong>Android, in Chrome:</strong> tap the <strong>⋮</strong> menu at the top right,
              then <strong>Add to Home screen</strong> or <strong>Install app</strong>. The sign-in
              screen may offer an <strong>Install</strong> button that does the same.
            </p>
            <p>
              <strong>A computer, in Chrome:</strong> click the install icon at the right of the
              address bar (a screen with a down arrow), or open the <strong>⋮</strong> menu, then{' '}
              <strong>Cast, save and share</strong> → <strong>Install page as app</strong>. It then
              opens in its own window from the Start menu, Dock or desktop.
            </p>
            <p>
              It still needs a signal to clock in or out — nothing is saved on the phone to send
              later, so if it says it could not reach the server, the punch did not happen.
            </p>
          </>
        ),
      },
      {
        question: 'How do I use the front-desk time clock?',
        answer: (
          <>
            <p>
              The time clock is the Domi Staff screen at the front desk — on the office computer or
              a tablet. Press <strong>Clock in or out</strong>, pick your name, type your PIN, and
              it clocks you in or out. It only lists the people who work at that office. At North
              Bergen it is the <strong>Time Clock</strong> app on the front-desk iPad — see{' '}
              <strong>The front-desk iPad</strong>, below.
            </p>
            <p>
              You choose your own PIN under <Screen>Your profile</Screen> in the account menu: 4 to
              8 digits, with your password to show it is you. Nobody can see it, managers included.
              Forgotten it? Choose a new one there, or ask a manager to set one for you — and do not
              use somebody else&rsquo;s.
            </p>
          </>
        ),
      },
      {
        question: 'I am working from home. How do I clock in?',
        answer: (
          <>
            <p>
              On <Screen>Home</Screen>, choose <strong>Work from home</strong> as the Location, then{' '}
              <strong>Clock in — working from home</strong>. No location is asked for or recorded,
              and the punch is marked &ldquo;Work from home&rdquo;. With a work-from-home shift on,
              it is already chosen for you.
            </p>
            <p>
              Without a work-from-home shift you can still do it — say you were approved to work
              from home today. You will see a warning and can say why; it shows on your timesheet as
              &ldquo;Not where scheduled&rdquo;, with your reason, for your manager to see.
            </p>
          </>
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
        question: 'What is the checklist when I clock out?',
        answer: (
          <>
            <p>
              Front Desk and Medical Assistants get their closing checklist when they press{' '}
              <strong>Clock out</strong> — on your phone or at the front-desk tablet. Front Desk
              first picks which desk they worked (Check In, Outdesk, or both). Tick what you did,
              enter the call counts, and tick any supplies we need more of; then clock out.
            </p>
            <p>
              You can always clock out, even with lines unticked — anything left is passed to a
              manager, not held against the punch. At the tablet you enter your PIN once to see the
              list and again to clock out. There is nowhere to type: never put a patient&rsquo;s
              details anywhere in it.
            </p>
          </>
        ),
      },
      {
        question: 'I forgot to clock out.',
        answer: (
          <p>
            Clock out as soon as you notice, then tell a manager what time you really left. They
            correct the time, and the correction is recorded with a reason so nobody has to remember
            later why it changed. You cannot change your own punches. If you have a shift, the app
            reminds you by email and under the bell 15 minutes after it ends while you are still
            clocked in — and 15 minutes after it starts if you have not clocked in. If you are still
            clocked in at midnight, the app clocks you out at 12:00 AM and tells you, so you can
            clock in as usual the next day; tell your manager when you really finished, because
            those hours cannot be approved until they correct the time.
          </p>
        ),
      },
      {
        question: 'I could not clock in at all.',
        answer: (
          <p>
            Tell a manager, and tell them what the app said if it refused you. They add the hours
            for you, with the reason, and it shows on your timesheet as{' '}
            <strong>Entered by hand</strong>. Each time that happens somebody looks into why, so it
            can be put right — a phone setting, or a problem with the app.
          </p>
        ),
      },
    ],
  },
  {
    // The North Bergen iPad (October 2026): the time clock, shared with BrainCheck
    // Assess for patients and the Google Home app for the thermostats. Never put
    // a passcode here — this guide is shown to everybody.
    title: 'The front-desk iPad',
    topics: [
      {
        question: 'What is the iPad for?',
        answer: (
          <>
            <p>The iPad at the North Bergen front desk does three jobs:</p>
            <ul>
              <li>
                <strong>Time Clock</strong> — clocking in and out. This is what it shows the rest of
                the time.
              </li>
              <li>
                <strong>BrainCheck</strong> — patients take the BrainCheck Assess test on it.
              </li>
              <li>
                <strong>Google Home</strong> — the thermostats at both offices.
              </li>
            </ul>
            <p>
              Whatever you use it for, <strong>leave it on Time Clock and on its charger</strong>{' '}
              when you are done, so the next person can clock in. It is set never to go to sleep.
            </p>
          </>
        ),
      },
      {
        question: 'Clocking in and out on the iPad',
        answer: (
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              If it is not showing the staff list, press the round <strong>Home button</strong>{' '}
              under the screen and tap <strong>Time Clock</strong>.
            </li>
            <li>
              Press <strong>Clock in or out</strong>, then find your name in the list — type the
              first letters to narrow it down — and type your PIN. It says whether you are now in or
              out.
            </li>
            <li>
              <strong>No PIN yet</strong> under your name? Choose one on your phone first:{' '}
              <Screen>Your profile → Tablet PIN</Screen>. Home reminds you until you have.
            </li>
            <li>
              Clocking out, Front Desk and Medical Assistants get their closing checklist: PIN, the
              list, then PIN again.
            </li>
          </ol>
        ),
      },
      {
        question: 'It is showing BrainCheck, or will not leave an app',
        answer: (
          <>
            <p>
              A patient may be taking their test — <strong>do not interrupt</strong>. Clock in on
              your phone instead, or come back when they are done.
            </p>
            <p>
              If the Home button does nothing, the iPad is locked to one app (Apple&rsquo;s{' '}
              <em>Guided Access</em>) while a patient has it. Only somebody with the Guided Access
              code can end it — a manager, or the MA running the test.
            </p>
          </>
        ),
      },
      {
        question: 'It is on the lock screen',
        answer: (
          <p>
            It restarts by itself after an overnight update. Somebody who has the iPad&rsquo;s
            passcode unlocks it and taps <strong>Time Clock</strong> — it is still set up, nothing
            needs doing to it. If nobody in the office has the passcode, clock in on your phone and
            tell a manager.
          </p>
        ),
      },
      {
        question: 'Giving a patient the BrainCheck test (MAs and providers)',
        // The web version (provider.braincheck.com on the Home Screen): the
        // old app's patient mode is not there. Until BrainCheck says whether
        // the web version has one and when a session times out, staff sign
        // out after every patient (docs/open-questions.md).
        answer: (
          <>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Press the <strong>Home button</strong> and tap <strong>BrainCheck</strong>. It is
                the BrainCheck website, kept on the Home Screen like an app.
              </li>
              <li>
                If it asks you to sign in, tap the saved login above the keyboard. The iPad asks for
                its own passcode before it fills it in.
              </li>
              <li>Set up the patient&rsquo;s test.</li>
              <li>
                <strong>Triple-click the Home button</strong> and tap <strong>Start</strong>. The
                iPad now stays in BrainCheck.
              </li>
              <li>
                Hand it to the patient, and <strong>stay close</strong>: the iPad cannot leave
                BrainCheck, but BrainCheck&rsquo;s other screens are still a tap away.
              </li>
            </ol>
            <p>When they have finished:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <strong>Triple-click</strong>, type the Guided Access code and tap{' '}
                <strong>End</strong>.
              </li>
              <li>
                <strong>Sign out of BrainCheck</strong> — every time, even with another patient
                straight after. Nobody should find the last person&rsquo;s results, or the provider
                screens, still open.
              </li>
              <li>
                Make sure nothing about the patient is left on the screen, press the{' '}
                <strong>Home button</strong> and tap <strong>Time Clock</strong>.
              </li>
            </ol>
          </>
        ),
      },
      {
        question: 'Changing the thermostat',
        answer: (
          <p>
            Press the <strong>Home button</strong>, open <strong>Google Home</strong>, pick the
            office and change the temperature. It works for West New York from North Bergen too.
            Then press the <strong>Home button</strong> and tap <strong>Time Clock</strong>.
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
            <Screen>Schedule</Screen> shows your shifts by week or by month, and in the week your
            time off too: &ldquo;Time off&rdquo; once it is approved, &ldquo;Asked off&rdquo; while
            it is waiting. Your shifts reach your own calendar (Google, Apple or Outlook) either as
            invites to your email — accept them if asked — or through the calendar link on that
            screen, which keeps itself up to date; <strong>Your calendar</strong> on that screen
            says which. Treat the link like a password: anyone who has it can see what is on it.
          </p>
        ),
      },
      {
        question: 'Where are the meetings and practice events?',
        answer: (
          <p>
            On <Screen>Schedule</Screen>, in the <strong>Events</strong> row above your shifts (and
            with a 📅 in the month): office meetings, meetings you have been added to, and
            practice-wide days like a wellness event. A 🔁 means it repeats, a 🎥 that it is a video
            call. Tap one for the time, the place and who it is for — and a{' '}
            <strong>Join video call</strong> button when there is one. The bell tells you when one
            is added, moved or cancelled, and reminds you the day before; they reach your
            phone&rsquo;s calendar too, as an invite or through the calendar link. An event is not a
            shift — if you are being paid to be there, clock in as usual.
          </p>
        ),
      },
      {
        question: 'When is the office closed?',
        answer: (
          <p>
            Holidays and other closures show with a 🔒 in the same Events row — &ldquo;Closed all
            day&rdquo; for Christmas, &ldquo;Closed from 1pm&rdquo; for an early close — and{' '}
            <strong>Holidays and closures</strong> further down <Screen>Schedule</Screen> lists the
            whole year. You only see the ones for your office. They reach your phone through the
            calendar link too, and the bell tells you when one is added or called off.
          </p>
        ),
      },
      {
        question: 'Where is the practice calendar?',
        answer: (
          <p>
            On <Screen>Schedule</Screen>, press <strong>Calendar</strong> at the top (next to
            Shifts). It shows the month with <strong>your own shifts</strong> 🕘 and approved days
            off 🌴 (under Show, <strong>My shifts</strong> — pick it alone to see just your schedule
            for the month; tap a shift to open its week), the <strong>diagnostics</strong> 🩺 (which
            tests, the hours, and the office — WNY or NB), <strong>rep lunches</strong> 🍽️ (the rep,
            their company, the medication, and whether they bring catering or the office orders —
            the bell tells you the evening before whether there is one at your office),{' '}
            <strong>holidays</strong> ⭐ (the offices are open unless there is also a closure),{' '}
            <strong>closures</strong> 🔒, meetings and events 📅, and <strong>pay days</strong> 💵 —
            the Friday after each pay period ends. Under <strong>Show</strong>, keep{' '}
            <strong>All</strong>, or tap one kind to see only that, and more to add them; All puts
            everything back. Pick an office to see only its diagnostics and rep lunches, and choose{' '}
            <strong>List</strong> for a day-by-day list (a phone starts there).{' '}
            <strong>Print</strong> gives the month on one page, like the paper calendar, with what
            you have chosen to show. Everything on it reaches your phone&rsquo;s calendar through
            the calendar link at the bottom of the page: <strong>Everything in one calendar</strong>
            , or <strong>Separate calendars</strong> to add only the ones you want (say, just
            Diagnostics and Pay days) — each shows on your phone as its own calendar you can colour
            and switch off. Use one or the other, not both, or things show twice.
          </p>
        ),
      },
      {
        question: 'What do 🍽️ and 🥪 on my shift mean?',
        answer: (
          <p>
            🍽️ means a rep is bringing lunch to that office that day — tap or hover for who, when,
            and whether they bring catering or the office orders. 🥪 means there is no rep lunch, so
            bring your own. Home says the same under today&rsquo;s shift, and the bell tells
            everybody at the office the evening before. Work-from-home shifts have neither.
          </p>
        ),
      },
      {
        question: 'Why does it say I am in overtime?',
        answer: (
          <p>
            If your published schedule puts you past the practice&rsquo;s weekly overtime line (40
            hours, both offices together), a red notice appears on <Screen>Home</Screen> and{' '}
            <Screen>Schedule</Screen>, and you get an email when it first happens. If it is not what
            you agreed, talk to your manager before the week starts.
          </p>
        ),
      },
      {
        question: 'How do I say when I cannot work?',
        answer: (
          <p>
            Open <Screen>Schedule</Screen> → <strong>When you can’t work</strong>. Add a weekday you
            are never free (all day or between two times), or a single date. Nobody has to approve
            it. It only affects weeks whose schedule has not been published yet — a published week
            is fixed, so for a date inside one, talk to your manager or ask for time off. If it
            clashes with a regular shift of yours, the managers are told, so they can sort the
            shift out with you.
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
            Press <strong>Request time off</strong> on <Screen>Home</Screen> or on{' '}
            <Screen>Schedule</Screen>, choose <strong>Sick</strong> or <strong>PTO</strong> and the
            dates, and send it. Your days left and what you have asked for are on the Schedule;{' '}
            <strong>All your time off</strong> there shows the rest. You get an email when a manager
            decides, with their reason if they give one.
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
            On <Screen>Home</Screen>, under the clock: the most important post in full, then the
            latest few. <strong>All news</strong> lists every post, newest first (on a phone, News
            is also under <Screen>More</Screen>).
          </p>
        ),
      },
      {
        question: 'Can I like, comment on or vote in a post?',
        answer: (
          <>
            <p>
              Yes. Under every post, <strong>Like</strong> and <strong>Comment</strong>; a post with
              a poll has its choices in it — tap one to vote, tap another to change your mind, or{' '}
              <strong>Take my vote back</strong>. On Home you can like and vote on the top post;
              comments are on <Screen>News</Screen>.
            </p>
            <p className="mt-2">
              <strong>All of it is under your name</strong>: everybody can see who liked a post, who
              wrote a comment and who picked what in a poll. (Surveys are different — those are
              anonymous.) You can change or delete your own comments; managers can delete any.
              Whoever wrote the post, and everybody who has already commented, gets a note on the
              bell when somebody comments. Never write anything about a patient.
            </p>
          </>
        ),
      },
      {
        question: 'How do I find a colleague?',
        answer: (
          <p>
            <Screen>Directory</Screen> lists everybody with their work email, phone number, job
            roles and offices. <strong>In now</strong> means they are clocked in at the moment.{' '}
            <strong>Working from home today</strong> lists who is clocked in from home, and anybody
            whose shift today is from home but who has not clocked in yet — point at a name (or tap
            it on a phone) to see their hours. Each job role has its own colour, so you can tell at
            a glance who is front desk, MA or provider. <strong>Office extensions</strong> lists
            every desk phone and person by section, as on the practice’s sheet. A “from home” number
            rings that person’s mobile on the days they work from home — on those days their card
            shows it first.
          </p>
        ),
      },
      {
        question: 'Whose birthday is it?',
        answer: (
          <p>
            Birthdays in the coming week are on <Screen>Home</Screen>, with a cake on the day in the{' '}
            <Screen>Schedule</Screen> and on each person&rsquo;s card in the{' '}
            <Screen>Directory</Screen>. Only the month and day are kept — never the year. Yours is
            on <Screen>Your profile</Screen>; if it is wrong or missing, ask a manager.
          </p>
        ),
      },
      {
        question: 'Where are the links and guides for my job?',
        answer: (
          <p>
            <Screen>Resources</Screen>. You see the resources for everyone, plus those for each of
            your job roles. A Google Drive folder (📁) opens in place: tap a file and it opens in a
            new tab — no Google account needed.
          </p>
        ),
      },
      {
        question: 'Are surveys really anonymous?',
        answer: (
          <>
            <p>
              Yes. Your answers are saved with no name and no time on them, so nobody — managers and
              admins included — can tell who said what. The app does note, separately, that you have
              taken part, so you cannot answer twice.
            </p>
            <p>
              Results only appear once a survey is closed and at least three people have answered.
              Surveys waiting for you are on <Screen>Home</Screen>.
            </p>
            <p>
              The <strong>suggestion box</strong> is on <Screen>Home</Screen> too, and always open:
              press <strong>Drop a note in</strong>, pick what sort of note it is if you like (an
              idea, something not working, a shout-out or a question), write it and send it. Only
              your message, the sort you picked and the day it arrived are kept — never your name or
              the time — so nobody, managers and admins included, can find out who sent it.
              <strong>Truly anonymous — how?</strong> on the card says the rest. The managers are
              told the next morning that something is waiting, and read it in the app.
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
        question: 'How do I add my photo or phone number?',
        answer: (
          <p>
            Menu under your name → <strong>Your profile</strong>. Add a photo, the name you go by,
            pronouns, your phone number and a line about yourself. Colleagues see them in the
            Directory. Your photo is cropped square and shrunk on your phone before it is sent;
            remove it whenever you like. An admin can also put one up for you — you are told under
            the bell, and can change it or take it down here.
          </p>
        ),
      },
      {
        question: 'I was told my license is running out.',
        answer: (
          <p>
            When a license or certificate of yours runs out in 60 days, again at 30 days, and if it
            lapses, you get a note under the bell and an email — once each. The bell note opens your
            licenses with their dates. Once it is renewed, give a manager the new expiry date; they
            enter it, and the reminders start again from the new date.
          </p>
        ),
      },
      {
        question: 'I was reminded about an onboarding task.',
        answer: (
          <p>
            When you start, some steps on your onboarding checklist are yours to do — reading the
            handbook, giving an emergency contact. Two days before one is due, and once if it goes
            past its date, you get a note under the bell and an email, with everything due in one
            message. The note opens your checklist: tick the task off there once it is done. If
            something is in the way, tell a manager.
          </p>
        ),
      },
      {
        question: 'Ask Domi Staff',
        answer: (
          <p>
            When it is switched on, <strong>Ask Domi Staff</strong> is on Home&rsquo;s Quick card:
            ask in your own words — &ldquo;When am I next on?&rdquo;, &ldquo;How much PTO do I
            have left?&rdquo;, &ldquo;Who is in at North Bergen?&rdquo; — and it answers from what
            you can already see in the app. Answers come from Claude, an AI service run by
            Anthropic, so your question and what it looks up for you are sent to it; nothing is
            kept in Domi Staff, and leaving the page ends the conversation. It only looks things
            up — it cannot change anything — and you can ask 40 questions a day. Never type
            patient details into it.
          </p>
        ),
      },
      {
        question: 'How do I change my password?',
        answer: (
          <p>
            Open the menu under your name → <strong>Change password</strong>. {PASSWORD_RULE} Avoid
            anything easy to guess, like the practice name or your own.
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
        question: 'What is the bell at the top?',
        answer: (
          <p>
            Your notifications — things that are just for you: a shift added to, changed on or taken
            off your schedule, a meeting, event or office closure added, moved or cancelled, your
            time off decided, overtime on your schedule, a survey waiting for you, your checklist
            starting, new posts on <Screen>News</Screen>, and comments on posts you wrote or
            commented on. The red number is how many you have not read. Choose one to go straight to
            it; they are kept for 90 days.
          </p>
        ),
      },
      {
        question: 'Which version am I using?',
        answer: (
          <p>
            It is at the bottom of this page, under <strong>About this version</strong>, and changes
            by itself every time a new version goes out. If it says a newer version is live, reload
            the page to get it.
          </p>
        ),
      },
      {
        question: 'What does the app keep about me?',
        answer: (
          <p>
            Your name, contact details, job roles, offices, shifts, punches and time off. Where you
            were when you clocked in on your phone is kept for 90 days and then deleted; it is not
            shown on timesheets. Clocking in from home records nothing about where you are. Your
            tablet PIN is stored scrambled, so nobody can read it back. It holds no social security
            number, no ID numbers and no personnel documents — those stay in your personnel file.
          </p>
        ),
      },
    ],
  },
];

/// For anybody who can make a care plan (CCM and APCM): providers, managers and admins.
const CARE_PLAN: Section[] = [
  {
    title: 'APCM Care Plan (also for CCM)',
    topics: [
      {
        question: 'Where is it, and how does it work?',
        answer: (
          <>
            <p>
              <Screen>Resources</Screen> → <Screen>Forms</Screen>, at the top →{' '}
              <strong>APCM Care Plan</strong>. Providers, managers and admins have it.
            </p>
            <ul>
              <li>
                Fill in the patient, then the general care plan, support, allergies and medications,
                and the numbers to track — the same questions as the practice&rsquo;s Google Form.
              </li>
              <li>
                Choose at least two chronic conditions. Each adds its own section with the questions
                from its form: desired outcomes, symptoms, long-term goals, the SMART goal,
                interventions, how the care team will help and barriers.
              </li>
              <li>
                Anything missing is listed at the bottom; tap an item to jump to it. The PDF can
                only be made when that list is empty.
              </li>
              <li>
                Choose <strong>English</strong> or <strong>English and Spanish</strong> (one PDF,
                English first, then the same in Spanish), download it, then tell it the PDF arrived
                — that clears the form.
              </li>
              <li>
                You are named on it as the person who prepared it; it is signed electronically by{' '}
                <strong>Dr. Jonathan Dominguez</strong>, who reviews it.
              </li>
            </ul>
          </>
        ),
      },
      {
        question: 'Does the care plan form keep anything?',
        answer: (
          <p>
            No. What you type stays on your device and is never sent to Domi Staff or saved in it —
            leaving, reloading or signing out clears it, and it asks first. The PDF is a patient
            record on your device: upload it to eCW Documents, give the patient their copy, then
            delete it.
          </p>
        ),
      },
      {
        question: 'Spanish, and what you type',
        answer: (
          <p>
            The questions&rsquo; answers and every ticked choice are printed in Spanish in the
            Spanish half; height stays in inches and weight in pounds. Anything you type — names,
            providers, the SMART goal, &ldquo;Other&rdquo; — is printed exactly as typed, so write
            it in Spanish if the patient reads Spanish. If somebody&rsquo;s primary language is
            Spanish the PDF starts as English and Spanish.
          </p>
        ),
      },
      {
        question: 'A condition with no form of its own',
        answer: (
          <p>
            Conditions the practice has no form for yet (COPD, depression, GERD and others) show the
            choices most of the forms share, and say so. Use the <strong>Other</strong> boxes for
            anything else.
          </p>
        ),
      },
    ],
  },
];

/// For anybody with the Annual Wellness Visit form: providers, medical assistants,
/// managers and admins.
const WELLNESS: Section[] = [
  {
    title: 'Annual Wellness Visit',
    topics: [
      {
        question: 'Who does which page?',
        answer: (
          <>
            <p>
              <Screen>Resources</Screen> → <Screen>Forms</Screen> →{' '}
              <strong>Annual Wellness Visit</strong> — the practice&rsquo;s Annual Wellness
              Supplement Form, one page at a time.
            </p>
            <ul>
              <li>
                <strong>Page 2, preventive services</strong> — the medical assistant. For each
                service tick Yes, No or Offered/Refused; for a Yes, the date it was done
                (MM/DD/YYYY, or just the month and year, or the year) and the result if there is
                one.
              </li>
              <li>
                <strong>Page 1, the questionnaire</strong> — the provider, with the patient: social
                history and functional ability, then the SPMSQ. Choose the patient&rsquo;s preferred
                language first and the questions are shown in it, to read as written.
              </li>
            </ul>
            <p>
              Providers open on page 1 and everybody else on page 2; the buttons at the top switch.
              Each page has its own PDF — <em>AWV Questionnaire</em> and{' '}
              <em>AWV Preventive Services</em> — signed electronically by whoever made it. Upload
              both to eCW Documents.
            </p>
          </>
        ),
      },
      {
        question: 'The SPMSQ score',
        answer: (
          <p>
            Mark each answer correct or incorrect — what the patient actually said is not kept — and
            choose their education. The score is worked out as on the paper form: 0&ndash;2
            incorrect is normal, 3&ndash;4 mild, 5&ndash;7 moderate and 8 or more severe cognitive
            impairment, with one more incorrect allowed for grade school or less and one less for
            education beyond high school.
          </p>
        ),
      },
      {
        question: 'Does it keep anything?',
        answer: (
          <p>
            No. Like the other forms, what you type stays on your device and is never sent to Domi
            Staff or saved in it. Page 1 printed in <strong>English and Spanish</strong> gives the
            English first, then the Spanish. Once you say a PDF arrived that page is cleared (and
            the patient too, unless the other page has answers on it).
          </p>
        ),
      },
    ],
  },
];

/// For people whose job role uses the clinical forms (Providers).
const PROVIDERS: Section[] = [
  {
    title: 'For providers: BrainCheck Care Plan',
    topics: [
      {
        question: 'Where is it, and how does it work?',
        answer: (
          <>
            <p>
              <Screen>Resources</Screen> → <Screen>Forms</Screen>, at the top →{' '}
              <strong>BrainCheck Care Plan</strong> — the cognitive assessment and care plan, billed
              as CPT 99483.
            </p>
            <ul>
              <li>Tick the requirements at the top first — all four are needed to bill 99483.</li>
              <li>
                Fill in the patient and visit. You are the provider: your name and letters come from
                your staff record.
              </li>
              <li>
                Work down A to J. Each section says what it still needs, and the bar at the top
                ticks it off once it is complete.
              </li>
              <li>
                Anything missing is listed at the bottom; tap an item to jump to it. The PDFs can
                only be made when that list is empty.
              </li>
              <li>
                Download the <strong>note</strong> and the <strong>handout</strong>, then tell it
                both arrived — that clears the form.
              </li>
            </ul>
          </>
        ),
      },
      {
        question: 'Is anything saved? (patient privacy)',
        answer: (
          <>
            <p>
              No. What you type stays on your device and is never sent to Domi Staff or saved in it
              — leaving, reloading or signing out clears it, and it asks first.
            </p>
            <p>
              The two PDFs you download are patient records on your device. Use your own or a
              practice device, not the shared front-desk tablet, and delete them once the note is in
              eCW and the handout is with the patient.
            </p>
          </>
        ),
      },
      {
        question: 'Completed at a prior visit',
        answer: (
          <p>
            Switch an element to <strong>Prior visit</strong> and tick the statement that it was
            reviewed today and is still valid or updated. Its details become optional — open{' '}
            <strong>Add details</strong> to record anything new. The history and exam (A) start as a
            prior visit. Driving (G) and the care plan (J) are needed either way.
          </p>
        ),
      },
      {
        question: 'Building the care plan',
        answer: (
          <>
            <p>
              Each area&rsquo;s problem is written from your answers above; press{' '}
              <strong>Edit</strong> to change it. Goals and actions that fit your answers are marked{' '}
              <strong>Suggested</strong> and listed first — nothing is ticked for you. Each area
              needs a goal and something that will be done.
            </p>
            <p>
              Ticked goals and actions go on the handout in plain words, in <strong>English</strong>
              , or <strong>English and Spanish</strong> (English first, then the same in Spanish) —
              choose under <strong>PDFs</strong>. Anything you type is printed as typed.
            </p>
          </>
        ),
      },
      {
        question: 'After the visit: eCW',
        answer: (
          <p>
            Upload the note (<strong>MM-DD-YYYY BrainCheck Note.pdf</strong>) to the patient&rsquo;s
            chart in eCW Documents and reference it in the progress note for the date of service.
            Give the patient and care partner the handout (
            <strong>MM-DD-YYYY Your Memory Care Plan.pdf</strong>), then delete both files from the
            device.
          </p>
        ),
      },
    ],
  },
];

const PRODUCTIVITY: Section[] = [
  {
    title: 'Your productivity',
    topics: [
      {
        question: 'Where do I see mine?',
        answer: (
          <>
            <p>
              <Screen>Your productivity</Screen>, in the account menu. Your manager works out each
              period and publishes it when it is ready; you are told under the bell. Each one shows
              the patients expected and seen in every interval, the difference, and &mdash; where
              your arrangement has one &mdash; the multiplier and the amount. A short period shows
              as a negative.
            </p>
            <p>
              Only you can see yours. If a number looks wrong, tell your manager: they can correct
              it and you will be told it was updated.
            </p>
          </>
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
            <Screen>Timesheet</Screen> shows everybody's punches. Pick the period (a pay period,
            say) and press <strong>Approve all N with nothing flagged</strong>: after asking, it
            approves every entry on screen that is not late, left early, edited, entered by hand,
            clocked out at midnight or somewhere other than scheduled. Those flagged ones stay, each
            with its own <strong>Approve</strong>, for you to look at first. The Day and Employee
            filters narrow what the button takes. The banner at the top lists what is still
            unapproved.
          </p>
        ),
      },
      {
        question: 'How do I fix a punch?',
        answer: (
          <p>
            Press <strong>Edit</strong>, change the time and give a reason. The reason is shown to
            the employee and kept, so a disputed payslip can be settled by looking. If the hours
            have already gone to payroll the app stops you and asks you to confirm; the correction
            is then flagged until a later export picks it up.
          </p>
        ),
      },
      {
        question: 'Shifts with no clock-in',
        answer: (
          <p>
            When a published shift is over and the person never clocked in that day — not on
            approved time off, and the office was not closed — it is listed on the{' '}
            <Screen>Timesheet</Screen> banner, counted on the Dashboard and in the nightly email,
            for two weeks. It goes once you have done whichever is true: <strong>+ Add hours</strong>{' '}
            if they worked and forgot, record the time off if they were off, or remove the shift if
            it should never have been on the rota. They were already reminded 15 minutes into the
            shift.
          </p>
        ),
      },
      {
        question: 'Somebody has no punch at all for a day',
        answer: (
          <>
            <p>
              On <Screen>Timesheet</Screen>, press <strong>+ Add hours</strong>: who, the day, when
              they started and finished, why it is by hand, and what happened. You cannot add your
              own hours — another manager does. <strong>Edit</strong> is still the way to fix a
              punch that is there, such as a missing clock-out.
            </p>
            <p>
              Every day added by hand is listed under <strong>Worth a look</strong> and in the
              nightly email until a <em>different</em> manager has found out why it was needed and
              pressed <strong>Looked into why…</strong> on it, with what they found. Treat each one
              like a bug report: somebody forgot, a phone needs a setting changed, or the app
              refused somebody it should not have. The hours themselves are approved and paid like
              any others.
            </p>
          </>
        ),
      },
      {
        question: 'How do I run payroll?',
        answer: (
          <>
            <p>
              <Screen>Manage → Export</Screen> opens on the last pay period. Check the summary — it
              says how many entries are flagged — then download the Excel file and upload it to
              payroll. Save the columns you use as a report so next time is one tap.
            </p>
            <p>
              Before the file is made, <strong>Before you export</strong> lists anything worth a
              look in that period: hours nobody has approved, somebody clocked out at midnight or
              still clocked in (their hours are left out until the time is fixed), hours entered by
              hand that nobody has looked into, corrections made after hours went to payroll,
              overtime, and — for ADP — anybody without an ADP File #. It only warns:{' '}
              <strong>Export anyway</strong> always makes the file, and a period with nothing to say
              downloads straight away.
            </p>
            <p>
              For ADP, choose <strong>ADP TotalSource</strong> under <em>Send to</em>, check the
              Batch ID, and download the import file. In TotalSource, go to Process → Payroll
              Dashboard → Manage Payroll → Worksheets → Import File, upload it, and check the
              imported worksheet before you submit. If ADP is greyed out, it says what an admin
              still has to set up.
            </p>
            <p>
              Every export is kept under <strong>Past exports</strong>, with the file exactly as it
              went out.
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
              A new shift for somebody — the ＋ on the rota, or <strong>+ Add</strong> — starts on
              <strong> their usual</strong> for that day: their regular shift if they have one,
              otherwise the hours and office they have worked most often on that weekday lately (or
              on any day, if that weekday has nothing settled). A line under the times says where
              it came from. Change anything; once you change the hours or place yourself, they are
              yours. With nothing usual it starts on 9 to 5 as before.
            </li>
            <li>
              <strong>+ Add → Repeating shifts</strong> makes, say, every Tuesday and Thursday for a
              month in one go. Clicking a day on the rota can do the same: tick{' '}
              <strong>Repeat this shift</strong>, pick the days and how long for.
            </li>
            <li>
              Under the days, <strong>Which weeks</strong> chooses every week, every other week (or
              every 3 or 4), or <strong>certain weeks of the month</strong> — the 1st, 2nd, 3rd, 4th
              or last — for a shift like the first Saturday of the month. The first few dates it
              makes are shown before you save. The 1st Saturday is the one on the 1st to the 7th;
              &ldquo;Last&rdquo; is the last one, even in a month with five. It works with No end
              date too, and a regular shift&rsquo;s <strong>Edit…</strong> can change it.
            </li>
            <li>
              For somebody who always works the same days, tick <strong>No end date</strong> in
              Repeating shifts. It keeps the rota filled eight weeks ahead, every night, until you
              stop it under <strong>Regular shifts</strong> below the rota: pick the last day, and
              the shifts after it come off (the person is told if they were published). Change or
              remove a single week as usual; the rest carry on.
            </li>
            <li>
              For somebody whose hours or office differ day to day — Mondays 12 to 8 at North
              Bergen, Tuesdays 9 to 5 at West New York, Fridays from home — set their{' '}
              <strong>usual week</strong> instead: under <strong>Regular shifts</strong>, choose
              them in <strong>Set somebody&rsquo;s usual week</strong> (or press{' '}
              <strong>Their week…</strong> beside one of theirs), tick the days they work and give
              each its hours and place. <strong>Same on all ticked days</strong> copies one
              day&rsquo;s hours to the rest. Save it once and it goes on the rota from the day you
              pick, kept eight weeks ahead. Changing it later only touches the days that changed.
              Admins find the same thing on the Staff screen, in the person&rsquo;s editor.
            </li>
            <li>
              The week is a <strong>rota</strong>: a row per person, a column per day. Click the
              empty space in a day to add a shift there, or click a shift to change who works it,
              publish it or remove it. <strong>Right-click</strong> a day — on the week or in the
              month — for <strong>Add a shift</strong>, <strong>Add time off</strong> (for that
              person, from that day), or an <strong>event</strong>, <strong>rep lunch</strong>,{' '}
              <strong>diagnostics date</strong> or <strong>holiday or closure</strong> on it.
              Removing a shift, or taking somebody off one, asks you to confirm first. Each
              day&rsquo;s heading shows its hours and how many are on.
            </li>
            <li>
              Show it for <strong>everyone</strong>, <strong>by location</strong> or{' '}
              <strong>by job role</strong>, and filter to one office or one role.
            </li>
            <li>
              The <strong>Month</strong> filters the same way — one office, one job role, or both
              (MAs in North Bergen) — and the box beside them shows one person&rsquo;s shifts: type
              part of their name, pick them, and page through their months. ✕ goes back to everyone.
            </li>
            <li>
              Each shift is filled with its office&rsquo;s colour and outlined in the job
              role&rsquo;s colour; the key above the rota says which is which. Work from home is
              violet, open shifts amber, drafts a dashed outline. Two job roles that should look the
              same (Administrative and Manager, say) can be given the same colour under Manage
              &rarr; Job roles.
            </li>
            <li>
              <strong>Right-click</strong> somebody&rsquo;s name or shift — on the week, in the
              month, or on their Directory card — for <strong>See profile</strong>,{' '}
              <strong>See schedule</strong> (their month, on its own),{' '}
              <strong>Open in Staff</strong> for admins, and <strong>Publish N draft shifts</strong>{' '}
              when that person has drafts. The bar above the rota that counts drafts has{' '}
              <strong>Publish all</strong> for everything on screen at once. Before anything goes
              out, <strong>Before you publish</strong> lists what is worth a look about those
              drafts: somebody whose required license has lapsed by the shift, on time off or asking
              for it, in a closure, on a time they said they can&rsquo;t work, going into overtime,
              after their last day, and open shifts still with nobody on them. It only warns:{' '}
              <strong>Publish anyway</strong> always works.
            </li>
            <li>
              Time off is in each person&rsquo;s row: hatched grey once approved, &ldquo;Asked
              off&rdquo; while you have not decided it yet. Adding a shift on somebody&rsquo;s day
              off warns you first, and each day&rsquo;s heading says how many are off.
            </li>
            <li>
              Time-off requests waiting on you, and anybody the rota puts into overtime, are one
              line each above the rota — click the line to open it, then Approve or Decline from
              there.
            </li>
            <li>
              <strong>Print</strong> gives the week on paper, one page per office, for the
              break-room wall. Only published shifts are printed, open shifts never, and time off
              just says &ldquo;Off&rdquo; — never sick or vacation.
            </li>
          </ul>
        ),
      },
      {
        question: 'What is an open shift?',
        answer: (
          <p>
            A shift the office needs covered that nobody is on yet — say two Front Desk on Saturday
            morning. Make them with <strong>+ Add → Shift</strong> or{' '}
            <strong>+ Add → Repeating shifts</strong> by choosing &ldquo;Nobody yet&rdquo;, or with
            a click in an office&rsquo;s Open shifts row. They are flagged on the rota, in the
            banner and in the nightly email until you click one and put somebody in it. Anybody
            already on at that time is greyed out.
          </p>
        ),
      },
      {
        question: 'Too many off at once',
        answer: (
          <p>
            When you decide a time-off request, a warning under it says if approving it leaves an
            office short of one job role — more than half of them off that day, counting requests
            still waiting as well as approved ones (so for a role of one or two, all of them). It
            names who else is off. It is only a warning: Approve still works. The Dashboard lists
            the next 8 weeks&rsquo; clashes, and the nightly email the next 2. Where you have set a
            minimum for that office and role (below), it goes by that instead of &ldquo;more than
            half&rdquo;.
          </p>
        ),
      },
      {
        question: 'A minimum per office and job role',
        answer: (
          <p>
            <Screen>Manage → Job roles</Screen> → <strong>Minimum on each day</strong>: the fewest
            people you want on in a job role at an office on a day it is open — say 2 Front Desk at
            North Bergen. Blank means none. Where there is one, Too many off at once warns when
            time off would leave fewer than that, and days the rota leaves short (drafts counted;
            working from home and open shifts not) are listed on the Schedule banner and in the
            nightly email for the next two weeks, and in <strong>Before you publish</strong>. A day
            counts once anything is on the rota at that office, so an unbuilt week is left to the
            &ldquo;not published yet&rdquo; reminder. It never stops anything.
          </p>
        ),
      },
      {
        question: 'Patterns worth a word',
        answer: (
          <p>
            On the <strong>Dashboard</strong>, and in the nightly email when there is one: anybody
            who, over the last four weeks, was late 3 times or more (it says &ldquo;3 Mondays
            running&rdquo; when it is the same day each week), forgot to clock out twice, or left
            early twice. <strong>Which days?</strong> lists them. Only managers see it, and the
            person is not told — it is a reason to ask how things are going, not a verdict. Hours
            entered by hand are not counted.
          </p>
        ),
      },
      {
        question: 'Heading for overtime this week',
        answer: (
          <p>
            The rota warns when the <em>schedule</em> takes somebody past the overtime line, but
            clocking in early and staying late add up too. On the <strong>Dashboard</strong>, and
            in the nightly email under Hours, is everybody paid by the hour whose hours{' '}
            <strong>worked so far this week</strong> plus what the rota{' '}
            <strong>still has them down for</strong> come to more than the line — in time to
            shorten a later shift. It shows what the rota alone would have been, so you can tell
            whether the overtime is the rota&rsquo;s or the extra minutes&rsquo;. Somebody still
            clocked in counts up to now; a clock-out the app made at midnight is left out until it
            is corrected. Only managers see it, and it is never a banner.
          </p>
        ),
      },
      {
        question: 'Who can cover this?',
        answer: (
          <p>
            Click any shift on the rota — open, or one whose person needs replacing — and{' '}
            <strong>Who can cover this</strong> suggests who to ask first: people at that office in
            the shift&rsquo;s job role who are free then, not off, haven&rsquo;t said they
            can&rsquo;t work then, and are furthest from overtime. Press a name to pick them. The
            list under it has everybody, in three groups — free, could but check first (with the
            reason: asked for the day off, not available then, close to or into overtime), and
            already on or off that day — so you can still choose anyone, and the usual warnings
            follow.
          </p>
        ),
      },
      {
        question: 'Filling a week’s open shifts in one go',
        answer: (
          <p>
            When a week has open shifts, press <strong>✨ Suggest people for them</strong> on the
            amber line above the rota. It proposes somebody free for each — the same rules as Who
            can cover this, never two shifts at once, and the hours spread so nobody gets them all —
            and says &ldquo;Nobody is free then&rdquo; where nobody is. Untick any you don&rsquo;t
            want and press <strong>Assign</strong>. Nothing changes before that, and drafts stay
            drafts until you publish.
          </p>
        ),
      },
      {
        question: 'Meetings and practice events',
        answer: (
          <p>
            On <Screen>Schedule</Screen>, choose <strong>+ Add → Event</strong>: a name, a time (or
            tick <strong>All day</strong>, for one day or several), where it is, and{' '}
            <strong>who it is for</strong> — Everyone, or type into the box and add any mix of job
            roles, offices and people (say <em>Provider</em>, <em>Kayla</em>, <em>Angelina</em>).
            For a call, paste its link into <strong>Video call link</strong> — or, once Google Meet
            is set up, tick <strong>Create a Google Meet link</strong> (hosted by office@; anybody
            with the link goes straight in, so share it only with the people invited). To make it
            repeat, choose from <strong>Repeats</strong>: every week, every 2 weeks, every month
            (the same date, or e.g. the first Friday), or <strong>Custom</strong> — every 2 weeks on
            Monday and Friday — until a date up to a year ahead. For meetings on alternate Fridays,
            make each one every 2 weeks, starting a week apart. Everybody it is for sees it in the
            Events row, gets one notification for the whole series and a reminder the day before,
            and has it on their phone if they sync their calendar. Click an event to change or
            remove <strong>just that date</strong> or <strong>that date and all after it</strong>.
            Events never count as hours or overtime — anybody being paid to attend clocks in as
            usual, so payroll stays with the punches.
          </p>
        ),
      },
      {
        question: 'Holidays and closures',
        answer: (
          <p>
            On <Screen>Schedule</Screen>, choose <strong>+ Add → Holiday or closure</strong>, or use{' '}
            <strong>+ Add closure</strong> under Holidays and closures. Tick{' '}
            <strong>Repeat every year</strong> to enter it for the next several years at once. Close{' '}
            <strong>both offices or just one</strong>, for the whole day (Christmas Day), several
            days, or part of one (Christmas Eve from 1pm — put midnight as when it opens again).
            Staff at that office see it and are told. Nothing stops you scheduling somebody during a
            closure, but it is flagged: a warning in the shift form, ⚠ on the shift, and a line in
            the Schedule banner and the nightly email until the shift is moved. Once a year is
            filled in, <strong>Copy these into next year</strong> puts every closure on the same
            date the following year — except the holidays that move (Thanksgiving and the day after,
            Memorial Day, Labor Day, MLK Day, Presidents&rsquo; Day, Columbus Day, Election Day,
            Good Friday, Easter), which go to their own day, recognised by name. Afterwards it lists
            what moved and any fixed holiday that lands on a weekend, so you can decide which day
            the office takes instead. Closures do
            not change pay: holiday pay is not set up. A day that is marked but{' '}
            <strong>shuts nothing</strong> — Election Day, Black Friday — is a{' '}
            <strong>holiday</strong> instead (<strong>+ Add holiday</strong>): everyone sees it on
            the calendar, nobody is notified and no shift is flagged. Copy into next year takes
            holidays too.
          </p>
        ),
      },
      {
        question: 'Rep lunches and the rep list',
        answer: (
          <p>
            Keep the reps under <Screen>Manage → Reps</Screen>: name, cell phone, company,
            medication, whether they bring catering or the office orders, a status (Preferred, OK to
            book, Has restrictions, Don&rsquo;t book) and notes. Then on{' '}
            <Screen>Schedule → Calendar</Screen> choose <strong>+ Add → Rep lunch</strong>, pick the
            rep, the office and the time; it is named after the rep. A rep marked{' '}
            <strong>Don&rsquo;t book</strong> asks you to confirm first, and a rep with restrictions
            shows their notes as you pick them. Everyone sees the lunch with the rep, company,
            medication and food; the front desk also sees the rep&rsquo;s cell phone (a job role
            setting, under Manage → Job roles); the status and notes are for managers only. Staff at
            that office are told when a lunch is added, moved or cancelled, and{' '}
            <strong>every evening at 6pm</strong> hear whether there is a rep lunch there the next
            day — or that there is none, so they bring their own. That evening notice goes only for
            days somebody is scheduled at the office and it is not closed. Correcting a rep&rsquo;s
            name renames their lunches too.
          </p>
        ),
      },
      {
        question: 'The diagnostics schedule',
        answer: (
          <p>
            On <Screen>Schedule → Calendar</Screen>, choose{' '}
            <strong>+ Add → Diagnostics date</strong>: which tests (&ldquo;US + ECHO&rdquo;,
            &ldquo;ANS + VNG&rdquo;), the office, and the hours. A pattern like &ldquo;every other
            Sunday at West New York&rdquo; can be entered once with <strong>Repeat</strong>; when a
            date is different, click a date and use <strong>Add another date like this</strong> — it
            copies the tests, hours and office, and you change the day. Everyone sees diagnostics
            and is told when one is added, moved or cancelled (no day-before reminder). Write when
            the tests are on and anything the front desk should know — never a patient&rsquo;s name
            or who is booked.
          </p>
        ),
      },
      {
        question: 'Work from home',
        answer: (
          <p>
            Choose <strong>Work from home</strong> as the Location when you make a shift, or click a
            shift and pick it under <strong>Hours and place</strong>. Once it is published, that
            person can clock in from anywhere from half an hour before it starts until it ends, with
            no location asked for or recorded. Behind the scenes it is counted under their main
            office, so the office view of the rota and the reports still add up. Anybody can also
            choose Work from home — or their other office — on a day the rota has them elsewhere,
            after a warning; the punch is marked <strong>Not where scheduled</strong> on the
            timesheet with the reason they gave, so check it before approving the hours.
          </p>
        ),
      },
      {
        question: 'Changing somebody’s hours or office',
        answer: (
          <>
            <p>
              Click the shift on the rota and change <strong>Starts</strong>, <strong>Ends</strong>{' '}
              or <strong>Location</strong> (another of their offices, or Work from home) under{' '}
              <strong>Hours and place</strong>. Then choose what to change:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Just this shift</strong> — one day.
              </li>
              <li>
                <strong>This and every later Wednesday like it</strong> (whichever day it is) —
                their shifts on that weekday, at the same office and the same old hours, from this
                one on.
              </li>
              <li>
                <strong>This and all of their later shifts at those hours</strong> — the same, on
                any day: when somebody&rsquo;s 7 to 2 becomes 1 to 8 for good, or they move to the
                other office.
              </li>
            </ul>
            <p className="mt-2">
              A shift that has started is left alone, and a day where the new hours would overlap
              another of their shifts is skipped and listed. If the shifts come from a regular
              shift, that changes too, so the weeks not on the rota yet follow. Only an office they
              work at is offered; add another on the Staff screen first. They are told once under
              the bell if the shifts were published.
            </p>
          </>
        ),
      },
      {
        question: 'A note on a shift',
        answer: (
          <p>
            Write it in <strong>Notes</strong> when you add a shift, or click a shift on the rota,
            type in its Notes box and press <strong>Save note</strong> — say{' '}
            <em>7–12 upstairs, 12–3 downstairs</em>. It shows on the shift with 📝, on their Home
            screen that day, on their phone calendar and on the printed rota. If the shift is
            published they are told under the bell when the note changes. Empty the box and save to
            take a note off.
          </p>
        ),
      },
      {
        question: 'Somebody has forgotten their tablet PIN',
        answer: (
          <p>
            In <Screen>Directory</Screen>, under their name, choose{' '}
            <strong>Set a new tablet PIN</strong> and tell them it in person. They can change it to
            one of their own on their profile. Nobody can see a PIN once it is set — you can only
            replace it.
          </p>
        ),
      },
      {
        question: 'What do the warnings mean?',
        answer: (
          <>
            <p>
              <strong>Overtime</strong> — the rota puts somebody past the weekly threshold (40
              hours, across both offices). Weeks for overtime start on the pay period&rsquo;s first
              day, so each pay period is two of them; Practice settings shows which day. It shows in
              red at the top of the schedule and beside their weekly total. Adding or assigning a
              shift checks first: the form warns as you fill it in, and saving asks you to confirm.
              Once a shift that puts them over is published, the person sees it too and is emailed.
              While you are adding or assigning a shift, an amber <strong>close to overtime</strong>{' '}
              note means it brings them within four hours of the line; once saved, only going over
              is flagged.
            </p>
            <p>
              <strong>Unavailable</strong> — the shift lands on time they have said they cannot
              work. Both are warnings: the shift is still saved, and you decide.
            </p>
          </>
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
            theirs. When somebody adds a time that clashes with one of their regular shifts in the
            next eight weeks, you hear at once under the bell, and it is listed on the Schedule
            banner and in the nightly email until the regular shift or the availability changes.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Time off, checklists and licenses',
    topics: [
      {
        question: 'How do I decide a time-off request?',
        answer: (
          <p>
            The <Screen>Schedule</Screen> tab shows a count of what is waiting, and the requests are
            at the top of the Schedule to approve or decline there. <strong>All requests</strong>{' '}
            beside them lists everybody&rsquo;s, waiting, approved or declined, each with what is
            already scheduled in those dates. Approving does not cancel shifts — the coverage strip
            flags the clash, and you reassign cover. To put in a request for somebody (one they made
            by phone), press <strong>+ Request time off</strong> and choose them under{' '}
            <strong>For</strong>.
          </p>
        ),
      },
      {
        question: 'Balances, and the time off rules',
        answer: (
          <p>
            Everybody&rsquo;s days left are on the <Screen>Dashboard</Screen>, under{' '}
            <strong>Time off balances</strong>, with a search box and <strong>Adjust</strong>. The
            practice&rsquo;s rules — PTO and sick days a year, what carries over, when the year
            starts — are in <Screen>Practice settings</Screen> (account menu), where an admin
            changes them.
          </p>
        ),
      },
      {
        question: 'Putting in time off people took before Domi Staff',
        answer: (
          <p>
            On the <Screen>Dashboard</Screen>, under <strong>Time off balances</strong>, press{' '}
            <strong>Adjust</strong> beside the person — or, as an admin, press{' '}
            <strong>Adjust balance</strong> under Time off on their profile. Enter the PTO and sick
            days they had already taken this year, rolled-over days included; anything booked in the
            app counts by itself. Under <strong>PTO a year</strong> choose the practice&rsquo;s
            amount, their own (part-time, long service) or <strong>No PTO</strong> for somebody who
            does not get it. <strong>PTO rolled over into this year</strong> is all that rolled over
            from last year — the app cannot know it, because it was not in use then, so it counts
            none until you enter it.
          </p>
        ),
      },
      {
        question: 'Shortcuts for one person (admins)',
        answer: (
          <p>
            On somebody&rsquo;s profile (<Screen>Manage → Staff</Screen>, press their name),{' '}
            <strong>For …</strong> opens their Schedule, Timesheet, Licenses, Onboarding &amp;
            offboarding or Availability showing them only — <strong>Show everyone</strong> goes back
            to the whole list — and <strong>+ Request time off for …</strong> opens the request form
            already for them.
          </p>
        ),
      },
      {
        question: 'Writing down time off day by day (admins)',
        answer: (
          <p>
            On somebody&rsquo;s profile (<Screen>Manage → Staff</Screen>, press their name), press{' '}
            <strong>+ Record past time off</strong>: Sick or PTO, the days, and a comment if you
            like. It counts as approved and comes off their balance; nobody is notified. The profile
            shows only what is left and what is coming up; <strong>See all</strong> opens everything
            on file, where a recorded day can be removed. Use it or the total under{' '}
            <strong>Adjust</strong> for the same days, not both — both would count them twice.
          </p>
        ),
      },
      {
        question: 'Starting or leaving',
        answer: (
          <p>
            <Screen>Manage → Onboarding &amp; Offboarding</Screen> tracks each step for a new hire
            or a leaver — who did it and when. The paperwork itself stays in the personnel file;
            nothing is uploaded here. Providers see theirs in the account menu (Your onboarding).
            Front Desk and MA staff have it in no menu, so you can tick their tasks for them — but
            anybody new is reminded about the tasks that are theirs two days before each is due and
            once if it goes overdue, and the reminder opens their checklist so they can tick those
            off themselves. The nightly email still lists overdue tasks for managers.
          </p>
        ),
      },
      {
        question: 'Closing checklists',
        answer: (
          <ul>
            <li>
              <Screen>Manage → Closing checklists</Screen> → <strong>Clock-outs</strong>: each
              day&rsquo;s clock-outs, with what was missed, call counts under target, and anybody
              who clocked out without the checklist. The same shows in the banner there and in the
              nightly email.
            </li>
            <li>
              <strong>Restock</strong>: supplies ticked as needed, per office. Asking again for the
              same thing adds to its count rather than a second line. Press{' '}
              <strong>Mark ordered</strong> once it is ordered.
            </li>
            <li>
              <strong>Edit lists</strong>: add, reword, reorder or remove lines; limit a line to
              certain days or one office; make a section a desk that only shows when somebody worked
              it. Any job role can have a list — somebody in two roles gets both.
            </li>
          </ul>
        ),
      },
      {
        question: 'License renewals',
        answer: (
          <p>
            <Screen>Manage → Licenses</Screen> opens on what lapses in the next 60 days. Record the
            expiry date only; press <strong>Renew</strong> to put in the new date. The person whose
            license it is hears about it too — under the bell and by email, at 60 days, at 30 days
            and once it lapses — so they can renew before you have to chase them. An old card with a
            newer one recorded beside it is not mentioned.
          </p>
        ),
      },
      {
        question: 'Which licenses each job role needs',
        answer: (
          <>
            <p>
              <Screen>Manage → Licenses → License types</Screen> is the practice&rsquo;s list: a
              name, how often it is renewed, and for each job role whether it is{' '}
              <strong>required</strong>, <strong>optional</strong> or not needed. Add one with{' '}
              <strong>+ New license type</strong>; <strong>Edit</strong> changes it, and{' '}
              <strong>Remove</strong> stops asking for it (what is on file stays).
            </p>
            <p>
              <strong>By person</strong> shows everybody against what their job roles ask for. A
              required one that is not on file is flagged there, on the banner and in the nightly
              email; optional ones are only listed. Press <strong>Record it</strong> on one and the
              form starts on that person and license — when the license has a renewal interval, the
              date it was done is enough and the expiry is worked out. The same list is on the
              person&rsquo;s card under <Screen>Staff → Edit</Screen>, and staff see their own.
            </p>
          </>
        ),
      },
      {
        question: 'Provider productivity',
        answer: (
          <>
            <p>
              <Screen>Manage → Provider productivity</Screen> replaces the Patients &amp; Providers
              sheet. Choose a provider (anybody in the Provider job role) then{' '}
              <strong>+ New statement</strong>. For each interval (two weeks on the sheet) fill in
              the patients <em>expected</em> and the patients <em>seen</em>; the difference and what
              it is worth work themselves out as you type. A short period stays negative, as on the
              sheet.
            </p>
            <p>
              Every provider&rsquo;s model differs, so nothing is compulsory. Under{' '}
              <strong>How theirs is counted</strong> you can set the length of an interval, how many
              make one statement, the patients expected, the multiplier and kinds of visit to count
              separately (for example In-Office and Hospital) &mdash; all optional, and only the
              starting point for each new statement. Leave the expected boxes empty for a provider
              with no target, and the multiplier empty for one with no money in it.
            </p>
            <p>
              Only the people an admin has chosen see this screen; admins choose them at the bottom
              of it. A statement is a private <strong>draft</strong> until you press{' '}
              <strong>Publish</strong>. Then that provider, and nobody else, can read it under{' '}
              <Screen>Your productivity</Screen> (account menu) and is told it is ready.{' '}
              <strong>Unpublish</strong> takes it back. Add a <strong>Paid on</strong> date or a
              short note (&ldquo;Paid with 08.15.25&rdquo;) &mdash; the provider reads the note, so
              never put a patient&rsquo;s name or details in it. Only counts are kept, never
              patients.
            </p>
          </>
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
            next two weeks that clash with somebody's availability or push them into overtime.{' '}
            <strong>Across the practice</strong> adds what is waiting on a manager (time off, hours
            to approve, missing clock-outs, hours entered by hand), licenses lapsed, due or missing,
            surveys and how many have answered, onboarding and offboarding progress, and the last
            week&rsquo;s closing checklists and supplies to order.
          </p>
        ),
      },
      {
        question: 'Job roles and their colours',
        answer: (
          <>
            <p>
              <Screen>Manage → Job roles</Screen>. Add, rename or remove roles, choose each one's
              colour, and put people in them — somebody can be in several. A job role decides which
              resources somebody sees, and nothing else: being in "Manager" gives no extra power in
              the app.
            </p>
            <p className="mt-2">
              A shift for somebody is always for one of <em>their</em> job roles: the Job role list
              on every shift form only offers the roles they are in, and with one role it is simply
              that one. To put somebody on a shift as something else, add them to that role here
              first. Open shifts can still be for any role.
            </p>
            <p className="mt-2">
              Somebody in several roles has a <strong>main job role</strong>, chosen by an admin
              under <strong>Edit</strong> on <Screen>Manage → Staff</Screen>. It is listed first,
              shift forms start on it, and in the Directory&rsquo;s <strong>In now</strong> they are
              shown under it — unless the shift they clocked in to is for another role, when they
              are shown under that one. Without a choice it is their first role in this list.
            </p>
          </>
        ),
      },
      {
        question: 'Adding resources',
        answer: (
          <p>
            On <Screen>Resources</Screen>, add a link (Drive, ADP, a vendor portal) or write a page,
            for everyone or for one job role. There are no uploads. For a Google Drive folder, share
            it in Drive with the app&rsquo;s own address (the form shows it) as a Viewer — not
            &ldquo;Anyone with the link&rdquo;. Staff then open its files through the app, so nobody
            needs access in Drive and nothing changes there when somebody joins or leaves. Google
            Docs, Sheets and Slides open as PDFs; Google Forms open only in Drive.
          </p>
        ),
      },
      {
        question: 'Running a survey',
        answer: (
          <p>
            On <Screen>Manage → Surveys</Screen>, write the questions (1–5 rating, pick one, or a
            written answer) and choose who it is for: everyone, a job role or a location. You see
            how many have answered, never who. Results appear once you close it, and only if at
            least three people answered — ask a small group and there may be nothing to show.
          </p>
        ),
      },
      {
        question: 'Changing the office extensions',
        answer: (
          <p>
            In <Screen>Directory</Screen>, press <strong>Edit</strong> on Office extensions. Each
            line has a section, a name or phone, the extension, and for a person their from-home
            number and the days they work from home. Match a line to a person and it shows on their
            Directory card too. Use ↑ ↓ to reorder and ✕ to remove, then{' '}
            <strong>Save extensions</strong>.
          </p>
        ),
      },
      {
        question: 'The suggestion box',
        answer: (
          <p>
            Notes from the suggestion box are under <Screen>Manage → Surveys</Screen>, at the
            bottom, with what sort of note each is (an idea, something not working, a shout-out or a
            question) and the day it arrived — never who sent it or when in the day. While any are
            waiting, Home says how many, and the nightly email says so too, without the words. Press{' '}
            <strong>Mark as dealt with</strong> once you have, and it stops being chased.
          </p>
        ),
      },
      {
        question: 'What needs a look?',
        answer: (
          <>
            <p>
              Banners on each screen list what needs attention there — unapproved hours, missing
              punches, lapsing licenses, next week unpublished, and so on. The same list is emailed
              each night.
            </p>
            <p>
              Under the menu → <Screen>Email settings</Screen>, untick the parts somebody else looks
              after — the rota, hours, time off, licenses and so on — or turn the email off.
              <strong> Who gets what</strong>, below it, shows every manager&rsquo;s choices; an
              admin can change anybody&rsquo;s there. A part nobody has chosen still goes to
              everybody, so nothing is missed. Time off also decides who is told as each request
              comes in. The banners always show everything.
            </p>
          </>
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
              <Screen>Manage → Staff</Screen> — add people one at a time or several at once. Press{' '}
              <strong>Edit</strong> on somebody&rsquo;s card to change their email, phone, access
              (Employee, Manager or Admin), job roles and their main one, offices and ADP File #,
              send their welcome email, or give them a temporary password or tablet PIN.
            </li>
            <li>
              Under <strong>Photo</strong> in the same editor you can put up somebody&rsquo;s
              profile photo — moved and zoomed into the circle and shrunk on your screen, like their
              own. They are told under the bell, and can change it or take it down on Your profile.
            </li>
            <li>
              Press somebody&rsquo;s <strong>name</strong> (or <strong>Profile</strong>) for their
              staff profile: contact details, home address, emergency contact, hire date, pay and
              position over time — each raise and promotion with the day it took effect — and their
              time off. Only admins can open it; the address, emergency contact and pay are shown
              nowhere else, not to managers and not in the payroll export.
            </li>
            <li>
              When somebody leaves: <strong>Edit</strong>, then <strong>… has left</strong> at the
              bottom, and pick their last day. It asks once more before anything happens. Their
              timesheets are kept, and if it was a mistake, tick <strong>Show former staff</strong>{' '}
              and bring them back from the same place.
            </li>
            <li>
              <Screen>Manage → Kiosks</Screen> — make a computer or tablet at the front desk the
              office&rsquo;s time clock.
            </li>
            <li>
              <Screen>Manage → Locations</Screen> — the office addresses, the geofence and office
              network. Stand at the front desk and press <strong>Use my current location</strong> to
              set the pin.
            </li>
          </ul>
        ),
      },
      {
        question: 'Adding everybody at once',
        answer: (
          <>
            <p>
              <Screen>Manage → Staff → Add several people</Screen>. In Excel or Google Sheets,
              select the list <strong>with its row of column names</strong>, copy, and paste it into
              the box. It needs a name, email, office (North Bergen, West New York or Both) and hire
              date; phone, job roles, access, birthday and ADP File # are optional. From a birthday
              only the month and day are kept — the year is dropped before anything is sent. Any
              other column — a social security number, say — is ignored and never kept.
            </p>
            <p>
              Every line is checked and shown first. Anything marked in red is fixed in the
              spreadsheet and pasted again; nobody is added until every line is ready.
            </p>
            <p>
              Then <strong>Send welcome emails</strong>: each person gets a link to choose their
              password, good for a week, with how to put Domi Staff on their phone and answers to
              the usual first-day questions. Somebody who lost theirs can be sent it again from
              their card; after they have chosen a password,{' '}
              <strong>Forgotten your password?</strong> on the sign-in screen is the way back in.
            </p>
          </>
        ),
      },
      {
        question: 'Using the office computer as the time clock',
        answer: (
          <>
            <p>
              Any computer or tablet at the front desk can be the office&rsquo;s time clock — no
              special device needed.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                On any device, open <Screen>Manage → Kiosks</Screen>, add one for that office and
                note the pairing code. It works for 15 minutes.
              </li>
              <li>
                On the front-desk computer, open <strong>{window.location.host}/kiosk</strong> in
                Chrome and type the code.
              </li>
              <li>
                That browser is now the time clock, for a year, through restarts. Keep it in its own
                window, or pin the tab, so the desk can use the computer for other work. Clearing
                the browser&rsquo;s history or cookies unpairs it — pair it again the same way.
              </li>
            </ol>
            <p>
              <strong>On an iPad or other tablet</strong>, open the same address and first choose{' '}
              <strong>Share → Add to Home Screen</strong>, leaving <em>Open as Web App</em> on. That
              makes a <strong>Time Clock</strong> app that opens straight on the time clock, full
              screen, with no address bar. Pair it inside that app rather than in the browser — the
              two keep separate cookies. Apple&rsquo;s Guided Access (Settings → Accessibility) can
              then keep the tablet on it.
            </p>
            <p>
              Turning the computer off at night is fine. The time clock is only reported as quiet if
              a whole shift at that office goes by without it being open. After ten wrong PINs in a
              quarter of an hour it stops taking PINs for five minutes, so nobody can sit and guess
              colleagues&rsquo; PINs.
            </p>
          </>
        ),
      },
      {
        question: 'Practice settings',
        answer: (
          <p>
            Under the menu → <strong>Practice settings</strong>: the overtime threshold, how early
            an unpublished week is chased, and the <strong>pay period start</strong> — the first day
            of any one pay period. The pay-period shortcuts stay greyed out until it is set. The{' '}
            <strong>ADP TotalSource</strong> section there sets up the ADP import file: the company
            code, a worksheet exported from ADP pasted in, and which columns take which hours. Each
            person&rsquo;s ADP File # goes on the Staff screen.
          </p>
        ),
      },
      {
        question: 'Giving a provider the BrainCheck Care Plan',
        answer: (
          <p>
            Add them to the <strong>Provider</strong> job role (<Screen>Job roles</Screen>) — the
            role has &ldquo;clinical forms&rdquo; switched on. Then, in <Screen>Staff</Screen> →{' '}
            <strong>Edit</strong>, fill in <strong>Letters after their name</strong> (MD, APN…) so
            the note shows their credentials.
          </p>
        ),
      },
      {
        question: 'Announcements',
        answer: (
          <p>
            On <Screen>News</Screen>, write, edit or remove posts. One post is always the primary
            one shown at the top of everybody's home screen; tick another to move it.{' '}
            <strong>+ Add a poll</strong> on a post asks a question with two to ten choices (tick{' '}
            <strong>People can pick more than one</strong> for tick boxes). Votes are named; for
            anonymous answers, use a survey. Once anybody has voted the choices are fixed —{' '}
            <strong>Close voting</strong> on the post stops it, and it can be opened again. Managers
            and admins can delete anybody's comment. Tick <strong>Show publicly</strong> to put a
            post on the front-desk time clock and under the sign-in form too (the newest three
            ticked) — title and message only. Patients at the desk, and anyone on the internet, can
            read those, so keep it to things anybody may read.
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
  const { employee } = useSession();
  const [params, setParams] = useSearchParams();
  const guide = isManager && params.get('guide') === 'managers' ? 'managers' : 'staff';
  const sections =
    guide === 'managers'
      ? [...MANAGERS, ...CARE_PLAN, ...WELLNESS]
      : [
          ...STAFF,
          ...(employee?.usesClinicalForms ? PROVIDERS : []),
          ...(employee && canUseCarePlan(employee) ? CARE_PLAN : []),
          ...(employee && canUseWellnessForm(employee) ? WELLNESS : []),
          ...(employee?.hasProductivity ? PRODUCTIVITY : []),
        ];

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
    <div className="max-w-3xl">
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

      <VersionCard />

      {!isManager && (
        <p className="mt-8 text-sm text-slate-500">
          Something not working?{' '}
          <Link to="/" className="font-medium text-brand-700 underline">
            Back to Home
          </Link>{' '}
          and tell a manager what the screen said.
        </p>
      )}
    </div>
  );
}

function slug(text: string): string {
  return `help-${text.toLowerCase().replace(/[^a-z]+/g, '-')}`;
}
