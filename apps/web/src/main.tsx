import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Catches Android's install prompt before any screen has mounted.
import './lib/install';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
