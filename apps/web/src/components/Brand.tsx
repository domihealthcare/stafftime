/// Domi Healthcare's roof mark, cropped from the practice's logo on
/// domihealthcare.com. Decorative: the name always sits beside it in text.
export function BrandMark({ className = 'h-6 w-auto' }: { className?: string }) {
  return <img src="/brand/domi-mark.png" alt="" aria-hidden="true" className={className} />;
}

const SLOGAN = 'Domi Healthcare — Your Health. Your Family. Your Home.';

/// The full logo with the practice's slogan, as Dominguez asked for it
/// (September 2026) — on every screen seen before signing in.
export function BrandLogo({ className = 'mx-auto h-24 w-auto' }: { className?: string }) {
  return <img src="/brand/domi-healthcare-slogan.png" alt={SLOGAN} className={className} />;
}

/// The same logo in black, for paper: it prints crisply on a black-and-white
/// office printer, where the light blues of the colour one wash out.
export function BrandLogoForPrint({ className = 'h-12 w-auto' }: { className?: string }) {
  return <img src="/brand/domi-healthcare-slogan-black.png" alt={SLOGAN} className={className} />;
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
