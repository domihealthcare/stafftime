import { useSearchParams } from 'react-router-dom';

/**
 * A screen narrowed to one person by `?person=<id>` — how a staff profile's
 * "For Robin" shortcuts open Timesheet, Licenses, Onboarding and Availability
 * (October 2026, Dominguez: things should be reachable from the person, not
 * only from their own screen). The Schedule has had `?person=` since
 * September; the others follow it.
 *
 * Returns the id (or null) and a way to drop it and see everyone again.
 */
export function useOnePerson(): { personId: string | null; showEveryone: () => void } {
  const [params, setParams] = useSearchParams();
  return {
    personId: params.get('person'),
    showEveryone: () => {
      const next = new URLSearchParams(params);
      next.delete('person');
      setParams(next, { replace: true });
    },
  };
}

/// "Showing Robin Profilesuite only · Show everyone", above the narrowed list.
export function OnePersonNote({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <p
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900"
      data-testid="one-person"
    >
      <span>
        Showing <strong>{name}</strong> only
      </span>
      <button
        type="button"
        onClick={onClear}
        className="tap font-medium text-brand-700 underline hover:text-brand-900"
      >
        Show everyone
      </button>
    </p>
  );
}
