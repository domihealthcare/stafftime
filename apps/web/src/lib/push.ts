import { api } from './api';

/**
 * Phone notifications in the browser (October 2026): turning them on for this
 * device, and off. The worker (`/push-sw.js`) only shows notifications — no
 * offline anything — and is registered only when somebody turns them on.
 */

export type PushState =
  /// This browser cannot do it at all.
  | 'unsupported'
  /// An iPhone or iPad, but Domi Staff is not on the Home Screen yet.
  | 'needs-home-screen'
  /// The person said no in the browser's own prompt; only settings undo it.
  | 'blocked'
  | 'off'
  | 'on';

const WORKER = '/push-sw.js';

function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function pushState(): Promise<PushState> {
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isAppleMobile() && !isStandalone() ? 'needs-home-screen' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

/// "iPhone", "Android", "Mac", "Windows" — so somebody can tell devices apart.
export function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'This device';
}

export async function turnOn(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for Domi Staff in this browser’s settings.'
        : 'Notifications were not allowed.',
    );
  }
  const registration = await navigator.serviceWorker.register(WORKER, { scope: '/' });
  await navigator.serviceWorker.ready;
  let subscription: PushSubscription;
  try {
    subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      }));
  } catch {
    await registration.unregister().catch(() => undefined);
    throw new Error(
      'This browser would not set up notifications. Check they are allowed for Domi Staff in its settings, then try again.',
    );
  }
  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await api.pushSubscribe({ endpoint: json.endpoint, keys: json.keys, device: deviceName() });
}

export async function turnOff(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api.pushUnsubscribe(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  }
  // Nothing left for the worker to do on this device.
  await registration?.unregister();
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
