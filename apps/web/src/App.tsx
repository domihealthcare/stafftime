import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './lib/api';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { KioskApp } from './kiosk/KioskApp';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { SessionProvider, useSession } from './lib/session';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { DashboardPage } from './pages/DashboardPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { JobRolesPage } from './pages/JobRolesPage';
import { NewsPage } from './pages/NewsPage';
import { HelpPage } from './pages/HelpPage';
import { ResourcePage } from './pages/ResourcePage';
import { ResourcesPage } from './pages/ResourcesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ClockPage } from './pages/ClockPage';
import { ExportPage } from './pages/ExportPage';
import { LocationsPage } from './pages/LocationsPage';
import { KiosksPage } from './pages/KiosksPage';
import { LoginPage } from './pages/LoginPage';
import { SchedulePage } from './pages/SchedulePage';
import { SetupPage } from './pages/SetupPage';
import { StaffPage } from './pages/StaffPage';
import { ChecklistsPage } from './pages/ChecklistsPage';
import { CredentialsPage } from './pages/CredentialsPage';
import { SurveysPage } from './pages/SurveysPage';
import { TimeOffPage } from './pages/TimeOffPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TimesheetPage } from './pages/TimesheetPage';

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
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
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
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ClockPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="help" element={<HelpPage />} />
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
        <Route path="credentials" element={<CredentialsPage />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="kiosks" element={<KiosksPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="*" element={<ClockPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      {/* Above everything, including sign-in and the kiosk. */}
      <EnvironmentBanner />
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
              <Routed />
            </SessionProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
