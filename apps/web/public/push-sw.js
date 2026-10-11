/*
 * Domi Staff — phone notifications (October 2026).
 *
 * This worker only shows notifications and opens the app when one is tapped.
 * It has NO fetch handler and caches nothing, on purpose: the app must never
 * seem to work offline — a punch with no signal has to plainly fail (see
 * "On a phone's home screen" in CLAUDE.md). tests/browser/push.mjs checks
 * that it stays that way.
 *
 * It is registered only when somebody turns phone notifications on.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = { title: 'Domi Staff', body: '', link: '/' };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // Not JSON: show what came, as it came.
    if (event.data) message.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { link: message.link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  // Only ever somewhere inside the app.
  const target = new URL(link.startsWith('/') ? link : '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
