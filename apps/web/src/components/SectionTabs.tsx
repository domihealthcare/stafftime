import { NavLink, useLocation } from 'react-router';
import { sectionFor, type ManageSection } from '../lib/manage-sections';

/**
 * The strip of tabs across the top of a Manage screen that has company:
 * People holds Staff, Job roles, Licenses and Onboarding; Offices holds
 * Locations, Kiosks, Closing checklists and Reps; and so on (October 2026,
 * Dominguez). Shown only when the person can open at least two of the
 * section's screens - a manager does not see Staff's tab, and somebody
 * answering a survey sees no strip at all.
 */
export function SectionTabs({ sections }: { sections: ManageSection[] }) {
  const { pathname } = useLocation();
  const section = sectionFor(sections, pathname);
  if (!section || section.tabs.length < 2) return null;
  return (
    <nav
      aria-label={`${section.label} screens`}
      className="-mt-2 mb-5 flex flex-wrap gap-x-1 border-b border-slate-300"
    >
      {section.tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
              isActive
                ? 'border-brand-600 text-brand-800'
                : 'border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-900'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
