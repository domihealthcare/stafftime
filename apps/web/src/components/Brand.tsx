/// Domi Healthcare's roof mark, cropped from the practice's logo on
/// domihealthcare.com. Decorative: the name always sits beside it in text.
export function BrandMark({ className = 'h-6 w-auto' }: { className?: string }) {
  return <img src="/brand/domi-mark.png" alt="" aria-hidden="true" className={className} />;
}

/// The full logo — roof and "Domi Healthcare" — for the sign-in screen.
export function BrandLogo({ className = 'h-16 w-auto' }: { className?: string }) {
  return <img src="/brand/domi-healthcare.png" alt="Domi Healthcare" className={className} />;
}

/// "Domi Staff" as it appears in the header: the roof mark, the practice's
/// name in its blue, the app's in grey.
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
