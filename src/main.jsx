import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './updateCenter.css';
import { initializeLiveUpdates } from './lib/liveUpdates';

function clearDevelopmentServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve();

  return Promise.all([
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister()))),
    'caches' in window
      ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
      : Promise.resolve(),
  ]).catch(() => undefined);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      void clearDevelopmentServiceWorker();
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains fully usable when service-worker registration is unavailable.
    });
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

window.addEventListener('load', () => {
  void initializeLiveUpdates();
});
