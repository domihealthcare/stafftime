import { jobRoleHex } from '../lib/job-role-colours';

/// A job role's name with its colour beside it. The colour is a dot, never the
/// text: the name is what is read, the dot is what is spotted across a list.
export function JobRoleTag({
  name,
  colour,
  main = false,
}: {
  name: string;
  colour: string | null | undefined;
  /// Marked as their main job role — shown where somebody holds several.
  main?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200"
      data-main-job-role={main || undefined}
    >
      <JobRoleDot colour={colour} />
      {name}
      {main && <span className="font-normal text-slate-500">· main</span>}
    </span>
  );
}

export function JobRoleDot({ colour }: { colour: string | null | undefined }) {
  return (
    <span
      aria-hidden="true"
      data-testid="job-role-dot"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: jobRoleHex(colour) }}
    />
  );
}
