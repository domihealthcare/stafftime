import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import type { JobRole } from '../lib/types';
import type { ViewAs } from '../lib/view-as';
import { JobRoleDot } from './JobRoleTag';
import { Modal } from './Modal';
import { Alert, Spinner, buttonClass } from './ui';

/**
 * An admin picks whose view to see (October 2026, Dominguez: "view as another
 * role, i can click one (or multiple) roles and be able to see the views that
 * others are having"): an access level, Employee or Manager, and any job
 * roles. From then on this tab shows what such a person sees - the menus, the
 * screens, Resources, the forms, their closing checklist - until Back to
 * yourself on the banner. They are still themselves: their own shifts, their
 * own hours, their own name on anything they save.
 */
export function ViewAsDialog({ onClose }: { onClose: () => void }) {
  const { setViewAs } = useSession();
  const [roles, setRoles] = useState<JobRole[] | null>(null);
  const [role, setRole] = useState<ViewAs['role']>('EMPLOYEE');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .jobRoles()
      .then(setRoles)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load.'));
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await setViewAs({ role, jobRoleIds: [...chosen] });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not switch the view.');
      setBusy(false);
    }
  }

  return (
    <Modal title="View as" onClose={onClose} testId="view-as-dialog">
      <p className="text-sm text-slate-600">
        See the app as somebody else sees it - to check a screen, or to show somebody how a thing is
        done. You stay yourself: your own shifts and hours, your own name on anything you save. A
        banner at the top takes you back.
      </p>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-700">Access</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {(
            [
              ['EMPLOYEE', 'Employee', 'what staff see'],
              ['MANAGER', 'Manager', 'what a manager sees'],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                role === value ? 'border-brand-600 bg-brand-50' : 'border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="view-as-role"
                value={value}
                checked={role === value}
                onChange={() => setRole(value)}
                className="text-brand-600 focus:ring-brand-600"
              />
              <span>
                <span className="font-medium text-slate-900">{label}</span>
                <span className="ml-1 text-slate-500">({hint})</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-700">
          Job roles{' '}
          <span className="font-normal text-slate-500">(optional - instead of your own)</span>
        </legend>
        <p className="mt-0.5 text-xs text-slate-500">
          What they decide: Resources, the forms and guides, the closing checklist at clock-out, and
          whether Your licenses and Your onboarding are in the account menu. Tick several to see
          somebody in more than one.
        </p>
        {!roles && !error ? (
          <div className="mt-2">
            <Spinner label="Loading job roles" />
          </div>
        ) : (
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {(roles ?? []).map((jobRole) => (
              <li key={jobRole.id}>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={chosen.has(jobRole.id)}
                    onChange={(event) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(jobRole.id);
                        else next.delete(jobRole.id);
                        return next;
                      })
                    }
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                  />
                  <JobRoleDot colour={jobRole.colour} />
                  {jobRole.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void start()}
          className={buttonClass('primary', 'md')}
        >
          {busy ? 'Switching…' : 'View as this'}
        </button>
        <button type="button" onClick={onClose} className={buttonClass('secondary', 'md')}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
