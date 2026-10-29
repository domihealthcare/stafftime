import { NavLink } from 'react-router';
import { canSeeOnCall } from '../lib/on-call';
import { useSession } from '../lib/session';
import { useT } from '../lib/i18n';

/**
 * Shifts | Calendar | Time off | Reviews (| On call), at the top of each (October 2026). The practice calendar
 * - meetings, diagnostics, holidays, closures and pay days - lives under
 * Schedule rather than in a tab of its own, so a phone's bottom bar stays at
 * five.
 */
export function ScheduleTabs() {
  const t = useT();
  const { employee } = useSession();
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-4 py-1 text-sm font-medium max-sm:flex-1 max-sm:px-2 max-sm:py-2.5 max-sm:text-center ${
      isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:text-slate-900'
    }`;
  return (
    <nav
      aria-label={t('Schedule or calendar')}
      className="mb-4 flex w-fit rounded-lg border border-slate-300 bg-white p-0.5 max-sm:w-full max-sm:flex-wrap"
    >
      <NavLink to="/schedule" end className={tab}>
        {t('Shifts')}
      </NavLink>
      <NavLink to="/schedule/calendar" className={tab}>
        {t('Calendar')}
      </NavLink>
      {/* Time off requests - everybody's for a manager, your own for staff -
          one press from the rota (October 2026, Dominguez: "how do i even get
          to time off requests?"). */}
      <NavLink to="/time-off" className={tab}>
        {t('Time off')}
      </NavLink>
      {/* Who reviews which provider's patient schedule: everybody (October 2026). */}
      <NavLink to="/schedule-reviews" className={tab}>
        {t('Reviews')}
      </NavLink>
      {/* Providers, managers and admins (October 2026). */}
      {canSeeOnCall(employee) && (
        <NavLink to="/on-call" className={tab}>
          {t('On call')}
        </NavLink>
      )}
      {/* The read-only whole rota, for staff an admin has chosen (October 2026).
          Managers and admins have the real rota under Shifts. */}
      {employee?.role === 'EMPLOYEE' && employee.canSeeEveryonesSchedule && (
        <NavLink to="/schedule/everyone" className={tab}>
          {t('Everyone')}
        </NavLink>
      )}
      {/* Hours worked, beside the rota (October 2026, Dominguez: one header row). */}
      <NavLink to="/timesheet" className={tab}>
        {t('Timesheet')}
      </NavLink>
    </nav>
  );
}
