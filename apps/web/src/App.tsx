import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { SessionProvider, useSession } from './lib/session';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ClockPage } from './pages/ClockPage';
import { LoginPage } from './pages/LoginPage';
import { SchedulePage } from './pages/SchedulePage';
import { TimesheetPage } from './pages/TimesheetPage';

function Routed() {
  const { employee, loading, mustChangePassword } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
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
        <Route path="*" element={<ClockPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routed />
      </SessionProvider>
    </BrowserRouter>
  );
}
