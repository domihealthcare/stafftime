import type { ReactNode } from 'react';

/**
 * The navigation's small line icons, drawn here so neither bar needs an icon
 * library. One set for both: beside each word in the laptop header (October
 * 2026, Dominguez: "please use the icons") and above it in the phone's bottom
 * bar. Always next to the word, never instead of it.
 */
function Icon({ children, size }: { children: ReactNode; size: 'sm' | 'md' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={size === 'sm' ? 'h-[18px] w-[18px] shrink-0' : 'h-6 w-6 shrink-0'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const PATHS = {
  home: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  schedule: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  timesheet: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  directory: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M16 13.2c2.3-.2 4 1.1 4.6 3.8" />
    </>
  ),
  resources: (
    <>
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
    </>
  ),
  news: (
    <>
      <rect x="4" y="5" width="13" height="14" rx="1.5" />
      <path d="M17 9h2.5v8.5A1.5 1.5 0 0 1 18 19M7.5 9h6M7.5 12.5h6M7.5 16h4" />
    </>
  ),
  surveys: (
    <>
      <path d="M5 5h14v10H9l-4 4z" />
      <path d="M9 9h6M9 12h4" />
    </>
  ),
  manage: (
    <>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.7-1.3-1.8-3.1-2 .8a7.4 7.4 0 0 0-2.6-1.5L14.4 3h-3.6l-.3 2.4a7.4 7.4 0 0 0-2.6 1.5l-2-.8-1.8 3.1 1.7 1.3a7.6 7.6 0 0 0 0 3l-1.7 1.3 1.8 3.1 2-.8a7.4 7.4 0 0 0 2.6 1.5l.3 2.4h3.6l.3-2.4a7.4 7.4 0 0 0 2.6-1.5l2 .8 1.8-3.1z" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
};

export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name, size = 'sm' }: { name: NavIconName; size?: 'sm' | 'md' }) {
  return <Icon size={size}>{PATHS[name]}</Icon>;
}
