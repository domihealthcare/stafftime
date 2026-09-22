import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './lib/api';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { KioskApp } from './kiosk/KioskApp';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { SessionProvider, useSession } from './lib/session';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ClockPage } from './pages/ClockPage';
import { ExportPage } from './pages/ExportPage';
import { LocationsPage } from './pages/LocationsPage';
import { KiosksPage } from './pages/KiosksPage';
import { LoginPage } from './pages/LoginPage';
import { SchedulePage } from './pages/SchedulePage';
import { SetupPage } from './pages/SetupPage';
import { StaffPage } from './pages/StaffPage';
import { TimeOffPage } from './pages/TimeOffPage';
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
        <Route path="timesheet" element={<TimesheetPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="password" element={<ChangePasswordPage forced={false} />} />
        <Route path="time-off" element={<TimeOffPage />} />
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
