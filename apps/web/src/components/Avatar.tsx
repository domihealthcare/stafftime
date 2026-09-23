/// A person's face, or their initials where they have not added a photo.
///
/// The photo URL carries its version (`photoUpdatedAt`), so the browser can
/// cache it and still never shows an old face after a change.
export function Avatar({
  person,
  size = 'md',
}: {
  person: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    photoUpdatedAt?: string | null;
  };
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const box = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-base',
    xl: 'h-24 w-24 text-2xl',
  }[size];
  const initials = `${(person.preferredName ?? person.firstName)[0] ?? ''}${person.lastName[0] ?? ''}`;

  if (person.photoUpdatedAt) {
    return (
      <img
        src={`/api/profile/photo/${person.id}?v=${encodeURIComponent(person.photoUpdatedAt)}`}
        alt=""
        aria-hidden="true"
        data-testid="avatar-photo"
        className={`${box} shrink-0 rounded-full object-cover ring-1 ring-slate-200`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid="avatar-initials"
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800`}
    >
      {initials}
    </span>
  );
}
