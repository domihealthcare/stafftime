import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import type { JobRole } from '../lib/types';
import { ViewAsDialog } from './ViewAsDialog';

/// Across the top while an admin is viewing the app as somebody else (October
/// 2026): who they are seeing it as, Change, and the way back.
export function ViewAsBanner() {
  const { employee, setViewAs } = useSession();
  const viewing = employee?.viewingAs ?? null;
  const [names, setNames] = useState<string[]>([]);
  const [changing, setChanging] = useState(false);

  // The chosen job roles' names, for the banner. Read as the admin: the
  // request still carries the view-as headers, and job roles are readable by
  // managers, so an Employee view asks once without them.
  useEffect(() => {
    if (!viewing?.jobRoleIds?.length) {
      setNames([]);
      return;
    }
    const ids = viewing.jobRoleIds;
    fetch('/api/job-roles', { credentials: 'include' })
      .then((response) => (response.ok ? (response.json() as Promise<JobRole[]>) : []))
      .then((roles) => setNames(roles.filter((role) => ids.includes(role.id)).map((r) => r.name)))
      .catch(() => setNames([]));
  }, [viewing?.jobRoleIds]);

  if (!viewing) return null;
  const level = viewing.role === 'MANAGER' ? 'a manager' : 'an employee';
  const roles = viewing.jobRoleIds?.length
    ? names.length > 0
      ? ` in ${names.join(', ')}`
      : ` in ${viewing.jobRoleIds.length} chosen job ${viewing.jobRoleIds.length === 1 ? 'role' : 'roles'}`
    : ' with your own job roles';
  return (
    <>
      <div
        className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900"
        role="status"
        data-testid="view-as-banner"
      >
        <strong>Viewing as {level}</strong>
        {roles}. This is what they see; you are still you.{' '}
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="ml-2 font-medium underline"
        >
          Change
        </button>
        <button
          type="button"
          onClick={() => void setViewAs(null)}
          className="ml-3 rounded-md bg-amber-900 px-2 py-0.5 font-medium text-white hover:bg-amber-950"
        >
          Back to yourself
        </button>
      </div>
      {changing && <ViewAsDialog onClose={() => setChanging(false)} />}
    </>
  );
}

// Keeps the import used when the banner's own fetch is swapped for the api
// helper one day; the helper would carry the view-as headers too.
void api;
