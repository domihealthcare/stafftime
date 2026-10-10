import { NavLink } from 'react-router-dom';
import { canSeeOnCall } from '../lib/on-call';
import { useSession } from '../lib/session';

/**
 * Shifts | Calendar, at the top of both (October 2026). The practice calendar
 * — meetings, diagnostics, holidays, closures and pay days — lives under
 * Schedule rather than in a tab of its own, so a phone's bottom bar stays at
 * five.
 */
export function ScheduleTabs() {
  const { employee } = useSession();
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-4 py-1 text-sm font-medium max-sm:flex-1 max-sm:py-2.5 max-sm:text-center ${
      isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:text-slate-900'
    }`;
  return (
    <nav
      aria-label="Schedule or calendar"
      className="mb-4 flex w-fit rounded-lg border border-slate-300 bg-white p-0.5 max-sm:w-full"
    >
      <NavLink to="/schedule" end className={tab}>
        Shifts
      </NavLink>
      <NavLink to="/schedule/calendar" className={tab}>
        Calendar
      </NavLink>
      {/* Providers, managers and admins (October 2026). */}
      {canSeeOnCall(employee) && (
        <NavLink to="/on-call" className={tab}>
          On call
        </NavLink>
      )}
    </nav>
  );
}
