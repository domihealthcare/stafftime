import type { ReactNode } from 'react';

/**
 * The pieces the downtime forms are drawn from (October 2026): a tick box, a
 * line to write on, a labelled blank, a row of choices, the logo and a form's
 * heading. Styled by the print page's own CSS (the `dt-` classes in
 * `pages/DowntimePrintPage.tsx`).
 */

export const Box = () => <i className="dt-b" aria-hidden="true" />;
export const Line = ({ width }: { width?: number }) => (
  <span className="dt-ln" style={width ? { flex: 'none', width } : undefined} />
);
export function Blank({
  label,
  width,
  grow = 1,
}: {
  label: string;
  width?: number;
  grow?: number;
}) {
  return (
    <div className="dt-fl" style={width ? { flex: 'none', width } : { flex: grow }}>
      <b>{label}</b>
      <Line />
    </div>
  );
}
export function Ticks({ label, options }: { label?: string; options: string[] }) {
  return (
    <div className="dt-opts">
      {label && <b>{label}</b>}
      {options.map((option) => (
        <span key={option}>
          <Box />
          {option}
        </span>
      ))}
    </div>
  );
}

export function Logo({ width = 132 }: { width?: number }) {
  return (
    <img
      src="/brand/domi-healthcare-slogan-black.png"
      alt="Domi Healthcare"
      className="dt-logo"
      style={{ width }}
    />
  );
}

export function Head({
  title,
  sub,
  right,
  logo = 132,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  logo?: number;
}) {
  return (
    <div className="dt-fhead">
      <div className="dt-head-left">
        <Logo width={logo} />
        <div>
          <div className="dt-ftitle">{title}</div>
          {sub && <div className="dt-fsub">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}
