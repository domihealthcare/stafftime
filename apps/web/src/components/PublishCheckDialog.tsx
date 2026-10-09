import type { PublishCheck } from '../lib/types';
import { WarningsDialog } from './WarningsDialog';

/**
 * "Before you publish" (October 2026, Dominguez — making the app smarter):
 * what is worth a look about the drafts about to go out — time off,
 * availability, overtime, closures, leavers, lapsed licenses, open shifts —
 * in one place, before staff are told. Warns, never refuses: **Publish
 * anyway** always works. The rules are the server's (`shifts/publish-check.ts`).
 */
export function PublishCheckDialog({
  check,
  whose,
  onPublish,
  onClose,
}: {
  check: PublishCheck;
  whose: string;
  onPublish: () => void;
  onClose: () => void;
}) {
  const count = check.drafts;
  return (
    <WarningsDialog
      title="Before you publish"
      testId="publish-check"
      intro={`${count} draft shift${count === 1 ? '' : 's'}. ${whose} will be able to see ${
        count === 1 ? 'it' : 'them'
      }, and each person is told once. Worth a look first:`}
      sections={check.sections}
      footnote="Nothing here stops you publishing. Fix any on the rota first, or publish anyway."
      confirmLabel="Publish anyway"
      onConfirm={onPublish}
      onClose={onClose}
    />
  );
}
