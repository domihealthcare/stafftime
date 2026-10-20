import { GuidePage } from './GuidePage';

/// The three guides, each at its own address (October 2026).
export function FrontDeskGuidePage() {
  return (
    <GuidePage
      slug="front-desk"
      title="Front desk guide"
      subtitle="Booking rules, results calls, message scripts, payments, uploading and medications: the Front Desk Cheat Sheet, searchable. Fill in a script and press Copy."
    />
  );
}

export function ResultsPlaybookPage() {
  return (
    <GuidePage
      slug="results-playbook"
      title="Results playbook"
      subtitle="What to do with each result: normal ranges, and in amber when action is needed. For providers, managers and admins."
    />
  );
}

export function InpatientNotesPage() {
  return (
    <GuidePage
      slug="inpatient-notes"
      title="Inpatient notes"
      subtitle="Hospital note templates to fill in and copy, and the hospital care codes by time. For providers, managers and admins."
    />
  );
}
