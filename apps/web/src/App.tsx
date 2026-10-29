import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, createBrowserRouter } from 'react-router';
// The provider for the browser comes from react-router/dom in version 7.
import { RouterProvider } from 'react-router/dom';
import { api } from './lib/api';
import { ConfirmProvider } from './components/ConfirmDialog';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { PinGate } from './components/PinGate';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { SessionProvider, useSession } from './lib/session';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ClockPage } from './pages/ClockPage';
import { RouteError } from './components/RouteError';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';

/*
  Everything but the Clock, sign-in and first-run screens is loaded when first
  opened, so a phone opening the app to clock in downloads only what that
  needs. The time clock is its own piece too: a signed-in phone never loads it.
*/
const AskPage = lazy(() => import('./pages/AskPage').then((m) => ({ default: m.AskPage })));
const CoverPage = lazy(() => import('./pages/CoverPage').then((m) => ({ default: m.CoverPage })));
const KioskApp = lazy(() => import('./kiosk/KioskApp').then((m) => ({ default: m.KioskApp })));
const AvailabilityPage = lazy(() =>
  import('./pages/AvailabilityPage').then((m) => ({ default: m.AvailabilityPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DirectoryPage = lazy(() =>
  import('./pages/DirectoryPage').then((m) => ({ default: m.DirectoryPage })),
);
const RepsPage = lazy(() => import('./pages/RepsPage').then((m) => ({ default: m.RepsPage })));
const DiagnosticsPage = lazy(() =>
  import('./pages/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage })),
);
const ReimbursementsPage = lazy(() =>
  import('./pages/ReimbursementsPage').then((m) => ({ default: m.ReimbursementsPage })),
);
const PhoneBookPage = lazy(() =>
  import('./pages/PhoneBookPage').then((m) => ({ default: m.PhoneBookPage })),
);
const FrontDeskGuidePage = lazy(() =>
  import('./pages/Guides').then((m) => ({ default: m.FrontDeskGuidePage })),
);
const ResultsPlaybookPage = lazy(() =>
  import('./pages/Guides').then((m) => ({ default: m.ResultsPlaybookPage })),
);
const InpatientNotesPage = lazy(() =>
  import('./pages/Guides').then((m) => ({ default: m.InpatientNotesPage })),
);
const InvoicesPage = lazy(() =>
  import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })),
);
const ProductivityPrintPage = lazy(() =>
  import('./pages/ProductivityPrintPage').then((m) => ({ default: m.ProductivityPrintPage })),
);
const DowntimePage = lazy(() =>
  import('./pages/DowntimePage').then((m) => ({ default: m.DowntimePage })),
);
const DowntimePrintPage = lazy(() =>
  import('./pages/DowntimePrintPage').then((m) => ({ default: m.DowntimePrintPage })),
);
const PhoneBookPrintPage = lazy(() =>
  import('./pages/PhoneBookPrintPage').then((m) => ({ default: m.PhoneBookPrintPage })),
);
const CmePage = lazy(() => import('./pages/CmePage').then((m) => ({ default: m.CmePage })));
const VendorsPage = lazy(() =>
  import('./pages/VendorsPage').then((m) => ({ default: m.VendorsPage })),
);
const ScheduleReviewsPage = lazy(() =>
  import('./pages/ScheduleReviewsPage').then((m) => ({ default: m.ScheduleReviewsPage })),
);
const OnCallPage = lazy(() =>
  import('./pages/OnCallPage').then((m) => ({ default: m.OnCallPage })),
);
const QuizPage = lazy(() => import('./pages/QuizPage').then((m) => ({ default: m.QuizPage })));
const QuizzesPage = lazy(() =>
  import('./pages/QuizzesPage').then((m) => ({ default: m.QuizzesPage })),
);
const QuizResultsPage = lazy(() =>
  import('./pages/QuizResultsPage').then((m) => ({ default: m.QuizResultsPage })),
);
const RequiredPage = lazy(() =>
  import('./pages/RequiredPage').then((m) => ({ default: m.RequiredPage })),
);
const ProductivityPage = lazy(() =>
  import('./pages/ProductivityPage').then((m) => ({ default: m.ProductivityPage })),
);
const MyProductivityPage = lazy(() =>
  import('./pages/MyProductivityPage').then((m) => ({ default: m.MyProductivityPage })),
);
const NewsPage = lazy(() => import('./pages/NewsPage').then((m) => ({ default: m.NewsPage })));
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })));
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const ResourcePage = lazy(() =>
  import('./pages/ResourcePage').then((m) => ({ default: m.ResourcePage })),
);
const ResourcesPage = lazy(() =>
  import('./pages/ResourcesPage').then((m) => ({ default: m.ResourcesPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const ExportPage = lazy(() =>
  import('./pages/ExportPage').then((m) => ({ default: m.ExportPage })),
);
const LocationsPage = lazy(() =>
  import('./pages/LocationsPage').then((m) => ({ default: m.LocationsPage })),
);
const KiosksPage = lazy(() =>
  import('./pages/KiosksPage').then((m) => ({ default: m.KiosksPage })),
);
const ClosingPage = lazy(() =>
  import('./pages/ClosingPage').then((m) => ({ default: m.ClosingPage })),
);
const SchedulePage = lazy(() =>
  import('./pages/SchedulePage').then((m) => ({ default: m.SchedulePage })),
);
const EveryonesSchedulePage = lazy(() =>
  import('./pages/EveryonesSchedulePage').then((m) => ({ default: m.EveryonesSchedulePage })),
);
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const CalendarPrintPage = lazy(() =>
  import('./pages/CalendarPrintPage').then((m) => ({ default: m.CalendarPrintPage })),
);
const RotaPrintPage = lazy(() =>
  import('./pages/RotaPrintPage').then((m) => ({ default: m.RotaPrintPage })),
);
const StaffPage = lazy(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })));
const PayPage = lazy(() => import('./pages/PayPage').then((m) => ({ default: m.PayPage })));
const StaffProfilePage = lazy(() =>
  import('./pages/StaffProfilePage').then((m) => ({ default: m.StaffProfilePage })),
);
const ChecklistsPage = lazy(() =>
  import('./pages/ChecklistsPage').then((m) => ({ default: m.ChecklistsPage })),
);
const CredentialsPage = lazy(() =>
  import('./pages/CredentialsPage').then((m) => ({ default: m.CredentialsPage })),
);
const SurveysPage = lazy(() =>
  import('./pages/SurveysPage').then((m) => ({ default: m.SurveysPage })),
);
const Review360Page = lazy(() =>
  import('./pages/Review360Page').then((m) => ({ default: m.Review360Page })),
);
const Review360ReportsPage = lazy(() =>
  import('./pages/Review360ReportsPage').then((m) => ({ default: m.Review360ReportsPage })),
);
const ReviewMeetingPage = lazy(() =>
  import('./pages/ReviewMeetingPage').then((m) => ({ default: m.ReviewMeetingPage })),
);
const TimeOffPage = lazy(() =>
  import('./pages/TimeOffPage').then((m) => ({ default: m.TimeOffPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
/// One piece with its PDF maker, so nothing more is fetched once it is open:
/// a release mid-visit cannot turn "make the PDF" into a reload that loses the
/// form (see the `vite:preloadError` handler in main.tsx).
const CognitiveAssessmentPage = lazy(() =>
  import('./clinical/cognitive-assessment/CognitiveAssessmentPage').then((m) => ({
    default: m.CognitiveAssessmentPage,
  })),
);
const CarePlanPage = lazy(() =>
  import('./clinical/ccm-care-plan/CarePlanPage').then((m) => ({ default: m.CarePlanPage })),
);
const WellnessVisitPage = lazy(() =>
  import('./clinical/wellness-visit/WellnessVisitPage').then((m) => ({
    default: m.WellnessVisitPage,
  })),
);
const TimesheetPage = lazy(() =>
  import('./pages/TimesheetPage').then((m) => ({ default: m.TimesheetPage })),
);

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}

function Routed() {
  const { employee, loading, mustChangePassword, refresh } = useSession();
  // On a brand-new deployment there are no accounts at all, so offer to create
  // the first one instead of a sign-in form nobody can use.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    if (employee) {
      setNeedsSetup(false);
      return;
    }
    let cancelled = false;
    api
      .setupStatus()
      .then((status) => !cancelled && setNeedsSetup(status.needsSetup))
      .catch(() => !cancelled && setNeedsSetup(false));
    return () => {
      cancelled = true;
    };
  }, [employee]);

  if (loading || (!employee && needsSetup === null)) {
    return <Loading />;
  }

  if (!employee && needsSetup) {
    return <SetupPage onCreated={() => void refresh().then(() => setNeedsSetup(false))} />;
  }

  if (!employee) {
    return <LoginPage />;
  }

  // The API refuses every other route while a temporary password stands, so the
  // app shows nothing else either.
  if (mustChangePassword) {
    return <ChangePasswordPage forced />;
  }

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Paper has no header or menus, so the printable rota sits outside the layout. */}
        <Route path="schedule/print" element={<RotaPrintPage />} />
        <Route path="schedule/calendar/print" element={<CalendarPrintPage />} />
        <Route path="phone-book/print" element={<PhoneBookPrintPage />} />
        <Route path="downtime/print" element={<DowntimePrintPage />} />
        {/* Shows pay, so behind the same PIN as the screen. */}
        <Route
          path="productivity/print"
          element={
            <div className="min-h-screen bg-slate-100 print:bg-white">
              <PinGate what="provider productivity">
                <ProductivityPrintPage />
              </PinGate>
            </div>
          }
        />
        <Route element={<Layout />}>
          <Route index element={<ClockPage />} />
          <Route path="news" element={<NewsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="ask" element={<AskPage />} />
          <Route path="cover/:id" element={<CoverPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="directory" element={<DirectoryPage />} />
          <Route path="surveys" element={<SurveysPage />} />
          <Route path="surveys/360/:id" element={<Review360Page />} />
          <Route path="surveys/360/:id/reports" element={<Review360ReportsPage />} />
          <Route path="surveys/360/:id/reports/:subjectId" element={<Review360ReportsPage />} />
          <Route path="meetings/:id" element={<ReviewMeetingPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="resources/:id" element={<ResourcePage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          {/* Job roles are on the Staff screen since October 2026. */}
          <Route path="job-roles" element={<Navigate to="/staff#job-roles" replace />} />
          <Route path="reps" element={<RepsPage />} />
          <Route path="diagnostics" element={<DiagnosticsPage />} />
          <Route path="phone-book" element={<PhoneBookPage />} />
          <Route path="downtime" element={<DowntimePage />} />
          <Route path="front-desk" element={<FrontDeskGuidePage />} />
          <Route path="results-playbook" element={<ResultsPlaybookPage />} />
          <Route path="inpatient-notes" element={<InpatientNotesPage />} />
          <Route
            path="invoices"
            element={
              <PinGate what="invoices">
                <InvoicesPage />
              </PinGate>
            }
          />
          <Route
            path="reimbursements"
            element={
              <PinGate what="reimbursements">
                <ReimbursementsPage />
              </PinGate>
            }
          />
          <Route
            path="vendors"
            element={
              <PinGate what="vendor payments">
                <VendorsPage />
              </PinGate>
            }
          />
          <Route path="cme" element={<CmePage />} />
          <Route path="required" element={<RequiredPage />} />
          <Route path="quizzes" element={<QuizzesPage />} />
          <Route path="quizzes/:id" element={<QuizPage />} />
          <Route path="quizzes/:id/results" element={<QuizResultsPage />} />
          <Route path="on-call" element={<OnCallPage />} />
          <Route path="schedule-reviews" element={<ScheduleReviewsPage />} />
          <Route path="timesheet" element={<TimesheetPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="schedule/calendar" element={<CalendarPage />} />
          <Route path="schedule/everyone" element={<EveryonesSchedulePage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="password" element={<ChangePasswordPage forced={false} />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="time-off" element={<TimeOffPage />} />
          <Route path="checklists" element={<ChecklistsPage />} />
          <Route path="closing" element={<ClosingPage />} />
          <Route path="credentials" element={<CredentialsPage />} />
          <Route
            path="productivity"
            element={
              <PinGate what="provider productivity">
                <ProductivityPage />
              </PinGate>
            }
          />
          <Route
            path="my-productivity"
            element={
              <PinGate what="your productivity">
                <MyProductivityPage />
              </PinGate>
            }
          />
          <Route
            path="export"
            element={
              <PinGate what="the payroll export">
                <ExportPage />
              </PinGate>
            }
          />
          <Route path="staff" element={<StaffPage />} />
          <Route
            path="pay"
            element={
              <PinGate>
                <PayPage />
              </PinGate>
            }
          />
          <Route
            path="staff/:id"
            element={
              <PinGate what="this staff profile">
                <StaffProfilePage />
              </PinGate>
            }
          />
          <Route path="kiosks" element={<KiosksPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="clinical/99483" element={<CognitiveAssessmentPage />} />
          <Route path="clinical/care-plan" element={<CarePlanPage />} />
          <Route path="clinical/wellness" element={<WellnessVisitPage />} />
          <Route path="*" element={<ClockPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function AppRoutes() {
  return (
    <>
      {/* Above everything, including sign-in and the kiosk. */}
      <EnvironmentBanner />
      <Suspense fallback={<Loading />}>
        <Routes>
          {/*
          The kiosk lives outside the signed-in app entirely: its own route, its
          own device credential, and no SessionProvider - a tablet must never be
          able to inherit a person's session.
        */}
          <Route path="/kiosk" element={<KioskApp />} />

          {/*
          Password reset is for people who cannot sign in, so it lives outside
          the session gate - otherwise the only way to reach it would be to
          already have the thing you have lost.
        */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="*"
            element={
              <SessionProvider>
                <ConfirmProvider>
                  <Routed />
                </ConfirmProvider>
              </SessionProvider>
            }
          />
        </Routes>
      </Suspense>
    </>
  );
}

/*
  A "data router" around the same routes as before, which stay where they
  were - in <Routes> above. It is here for one thing: `useBlocker`, which only
  works under one. The clinical form uses it to ask before somebody leaves a
  half-filled form by a link or the Back button (September 2026); a plain
  BrowserRouter cannot stop either.
*/
const router = createBrowserRouter([
  // errorElement: plain words and a Reload button when a screen crashes,
  // instead of the router's developer page with its stack trace.
  { path: '*', element: <AppRoutes />, errorElement: <RouteError /> },
]);

/*
  useTransitions={false} keeps navigation as it was under React Router 6:
  each change of address is shown at once. Version 7 otherwise wraps it in a
  React transition, which loses letters typed quickly into search boxes whose
  text lives in the address (the phone book, the guides) and makes ticks and
  pickers kept there lag a press behind (October 2026).
*/
export function App() {
  return <RouterProvider router={router} useTransitions={false} />;
}
