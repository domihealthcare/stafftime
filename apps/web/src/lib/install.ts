/**
 * Putting Domi Staff on a phone's home screen.
 *
 * It is an installable web app (a manifest and icons), not an app-store app,
 * and deliberately has no service worker: a timeclock that seemed to work with
 * no signal would take a punch it could not keep.
 *
 * Android's browsers offer their own install prompt through
 * `beforeinstallprompt`, which fires once, early — often before the sign-in
 * screen has mounted — so it is caught here, at start-up, and held until the
 * tip asks for it. iPhones have no such event; there the tip explains Share →
 * Add to Home Screen instead.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    listeners.forEach((listener) => listener());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((listener) => listener());
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function onInstallAvailabilityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's own install prompt; true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  listeners.forEach((listener) => listener());
  return outcome === 'accepted';
}

/** Already opened from the home screen, so there is nothing to suggest. */
export function isInstalled(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    // Very old browsers: fall through.
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type PhoneKind = 'ios' | 'android' | null;

export function phoneKind(): PhoneKind {
  const agent = navigator.userAgent;
  if (/iPhone|iPod/.test(agent)) return 'ios';
  // iPads report themselves as a Mac; the touch screen gives them away.
  if (/iPad/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(agent)) return 'android';
  return null;
}
