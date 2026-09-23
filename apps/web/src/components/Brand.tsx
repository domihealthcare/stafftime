/// The app's mark: a clock face in the practice's blue. Not the Domi
/// Healthcare logo — that belongs to the website and should replace this once
/// a copy of the file is in the repo.
export function BrandMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="14" className="fill-brand-600" />
      <path
        d="M16 8v8.5l5.5 3.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/// "Domi Staff" as it appears in the header: the practice's name in its blue,
/// the app's in grey.
export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <BrandMark />
      <span className="text-lg leading-none tracking-tight">
        <span className="font-bold text-brand-700">Domi</span>{' '}
        <span className="font-medium text-slate-500">Staff</span>
      </span>
    </span>
  );
}
