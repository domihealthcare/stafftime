import { useEffect } from 'react';
import type { JobRole } from '../lib/types';

/// The job roles somebody holds, in the practice's order.
export function rolesHeldBy(personId: string, jobRoles: JobRole[]): JobRole[] {
  return jobRoles.filter((role) => role.members.some((member) => member.id === personId));
}

/**
 * Which job role a shift is for. For somebody's shift, only the roles they
 * hold — no "any" and no "not specified" (Dominguez, September 2026: "I
 * shouldn't have the option to be 'any job role', only the job roles assigned
 * to me"). With one role it is simply that one. The server holds the same rule
 * (`held-job-role.ts`).
 *
 * An open shift belongs to nobody yet, so it can still be for any role, or
 * none. Until somebody is chosen there is nothing to choose from.
 */
export function JobRoleSelect({
  id,
  value,
  onChange,
  jobRoles,
  personId,
  open = false,
  className,
  label,
}: {
  id: string;
  value: string;
  onChange: (jobRoleId: string) => void;
  jobRoles: JobRole[];
  /// Whose shift it is; absent while nobody is chosen, or for an open shift.
  personId?: string;
  /// An open shift: any role, or none.
  open?: boolean;
  className: string;
  /// Read out when there is no <label> for it.
  label?: string;
}) {
  const held = personId ? rolesHeldBy(personId, jobRoles) : [];
  const heldIds = held.map((role) => role.id).join();

  // Keep the value one of theirs: their first role when it is not, and none
  // when they hold none.
  useEffect(() => {
    if (!personId) return;
    const ids = heldIds ? heldIds.split(',') : [];
    if (ids.length > 0 && !ids.includes(value)) onChange(ids[0]);
    if (ids.length === 0 && value) onChange('');
  }, [personId, heldIds, value, onChange]);

  if (open) {
    return (
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      >
        <option value="">Any role</option>
        {jobRoles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
    );
  }

  if (!personId || held.length === 0) {
    return (
      <>
        <select id={id} aria-label={label} value="" disabled className={className}>
          <option value="">{personId ? 'No job role yet' : 'Choose who first'}</option>
        </select>
        {personId && (
          <p className="mt-1 text-xs text-amber-700" data-testid="no-job-role">
            They are not in any job role yet — add them to one on Staff.
          </p>
        )}
      </>
    );
  }

  return (
    <select
      id={id}
      aria-label={label}
      value={held.some((role) => role.id === value) ? value : held[0].id}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {held.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </select>
  );
}
