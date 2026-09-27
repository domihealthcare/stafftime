import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Catches Android's install prompt before any screen has mounted.
import './lib/install';
import './index.css';

// Screens are loaded when first opened. After a release, a tab left open from
// before asks for pieces that are no longer there; reload onto the new version
// rather than show a blank screen. Once a minute at most, so a real outage
// cannot turn into a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'domi-staff:reloaded-for-update';
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // Without storage there is no telling whether this is a loop, so don't.
    return;
  }
  event.preventDefault();
  window.location.reload();
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
