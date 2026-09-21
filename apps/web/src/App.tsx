import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Alert, Spinner } from './components/ui';
import { SessionProvider, useSession } from './lib/session';
import { ClockPage } from './pages/ClockPage';
import { SchedulePage } from './pages/SchedulePage';
import { SignInPage } from './pages/SignInPage';
import { TimesheetPage } from './pages/TimesheetPage';

function Routed() {
  const { employee, loading, error } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md p-4 pt-16">
        <Alert>{error}</Alert>
      </div>
    );
  }

  if (!employee) {
    return <SignInPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ClockPage />} />
        <Route path="timesheet" element={<TimesheetPage />} />
        <Route path="schedule" element={<SchedulePage />} />
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
