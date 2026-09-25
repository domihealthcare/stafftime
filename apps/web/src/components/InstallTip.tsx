import { useEffect, useState } from 'react';
import {
  canPromptInstall,
  isInstalled,
  onInstallAvailabilityChange,
  phoneKind,
  promptInstall,
} from '../lib/install';

const DISMISSED_KEY = 'domi-staff.install-tip-dismissed';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * A one-time suggestion on the sign-in screen, on phones only, to put Domi
 * Staff on the home screen. Gone for good once closed, and never shown when
 * the app was already opened from the home screen.
 */
export function InstallTip() {
  const [kind] = useState(phoneKind);
  const [hidden, setHidden] = useState(() => isInstalled() || wasDismissed());
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);

  useEffect(() => onInstallAvailabilityChange(() => setCanPrompt(canPromptInstall())), []);

  if (!kind || hidden) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private browsing: it will just come back next time.
    }
    setHidden(true);
  }

  async function install() {
    if (await promptInstall()) dismiss();
  }

  return (
    <section
      aria-label="Add Domi Staff to your home screen"
      data-testid="install-tip"
      className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-700 shadow-sm ring-1 ring-brand-100"
    >
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-slate-200" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Add Domi Staff to your home screen</p>
          {kind === 'ios' ? (
            <p className="mt-1">
              Tap <strong>Share</strong>{' '}
              <ShareIcon />
              {' '}at the bottom of Safari, then <strong>Add to Home Screen</strong>. It opens
              like an app — no app store needed.
            </p>
          ) : canPrompt ? (
            <p className="mt-1">It opens like an app — no app store needed.</p>
          ) : (
            <p className="mt-1">
              Tap the <strong>⋮</strong> menu in Chrome, then <strong>Add to Home screen</strong>{' '}
              (or <strong>Install app</strong>). It opens like an app — no app store needed.
            </p>
          )}
          <div className="mt-3 flex items-center gap-4">
            {kind === 'android' && canPrompt && (
              <button
                type="button"
                onClick={() => void install()}
                className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="font-medium text-slate-500 hover:text-slate-800"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Safari's Share symbol: a box with an arrow out of the top. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="-mt-1 inline h-4 w-4 text-brand-700"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
