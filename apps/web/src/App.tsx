import { Suspense, lazy, useEffect, useState } from 'react';
import { Route, RouterProvider, Routes, createBrowserRouter } from 'react-router-dom';
import { api } from './lib/api';
import { ConfirmProvider } from './components/ConfirmDialog';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { SessionProvider, useSession } from './lib/session';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ClockPage } from './pages/ClockPage';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';

/*
  Everything but the Clock, sign-in and first-run screens is loaded when first
  opened, so a phone opening the app to clock in downloads only what that
  needs. The time clock is its own piece too: a signed-in phone never loads it.
*/
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
const JobRolesPage = lazy(() =>
  import('./pages/JobRolesPage').then((m) => ({ default: m.JobRolesPage })),
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
const RotaPrintPage = lazy(() =>
  import('./pages/RotaPrintPage').then((m) => ({ default: m.RotaPrintPage })),
);
const StaffPage = lazy(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })));
const ChecklistsPage = lazy(() =>
  import('./pages/ChecklistsPage').then((m) => ({ default: m.ChecklistsPage })),
);
const CredentialsPage = lazy(() =>
  import('./pages/CredentialsPage').then((m) => ({ default: m.CredentialsPage })),
);
const SurveysPage = lazy(() =>
  import('./pages/SurveysPage').then((m) => ({ default: m.SurveysPage })),
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
        <Route element={<Layout />}>
          <Route index element={<ClockPage />} />
          <Route path="news" element={<NewsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="directory" element={<DirectoryPage />} />
          <Route path="surveys" element={<SurveysPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="resources/:id" element={<ResourcePage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="job-roles" element={<JobRolesPage />} />
          <Route path="timesheet" element={<TimesheetPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="password" element={<ChangePasswordPage forced={false} />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="time-off" element={<TimeOffPage />} />
          <Route path="checklists" element={<ChecklistsPage />} />
          <Route path="closing" element={<ClosingPage />} />
          <Route path="credentials" element={<CredentialsPage />} />
          <Route path="productivity" element={<ProductivityPage />} />
          <Route path="my-productivity" element={<MyProductivityPage />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="kiosks" element={<KiosksPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="clinical/99483" element={<CognitiveAssessmentPage />} />
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
          own device credential, and no SessionProvider — a tablet must never be
          able to inherit a person's session.
        */}
          <Route path="/kiosk" element={<KioskApp />} />

          {/*
          Password reset is for people who cannot sign in, so it lives outside
          the session gate — otherwise the only way to reach it would be to
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
  were — in <Routes> above. It is here for one thing: `useBlocker`, which only
  works under one. The clinical form uses it to ask before somebody leaves a
  half-filled form by a link or the Back button (September 2026); a plain
  BrowserRouter cannot stop either.
*/
const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }]);

export function App() {
  return <RouterProvider router={router} />;
}
