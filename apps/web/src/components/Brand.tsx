/// Domi Healthcare's roof mark, cropped from the practice's logo on
/// domihealthcare.com. Decorative: the name always sits beside it in text.
export function BrandMark({ className = 'h-6 w-auto' }: { className?: string }) {
  return <img src="/brand/domi-mark.png" alt="" aria-hidden="true" className={className} />;
}

export const SLOGAN_TEXT = 'Your Health. Your Family. Your Home.';
const SLOGAN = `Domi Healthcare — ${SLOGAN_TEXT}`;

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
/// name heavy in its dark blue, the app's in grey. Bolder since September 2026,
/// as Dominguez asked.
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className="h-8 w-auto" />
      <span className="text-[1.35rem] leading-none tracking-tight">
        <span className="font-extrabold text-brand-800">Domi</span>{' '}
        <span className="font-semibold text-slate-500">Staff</span>
      </span>
    </span>
  );
}

/// The practice's slogan on a thin blue strip under the header, on every
/// signed-in screen (chosen by Dominguez from three renderings, September
/// 2026). Left off paper: the printed rota has the logo with the slogan.
export function SloganStrip() {
  return (
    <div
      data-testid="slogan-strip"
      className="bg-brand-700 px-4 py-1 text-center text-xs font-semibold tracking-wide text-white print:hidden"
    >
      {SLOGAN_TEXT}
    </div>
  );
}
