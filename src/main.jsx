import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import UpdateCenter from './UpdateCenter';
import './styles.css';
import './updateCenter.css';
import { initializeLiveUpdates } from './lib/liveUpdates';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains fully usable when service-worker registration is unavailable.
    });
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <UpdateCenter />
  </React.StrictMode>
);

window.addEventListener('load', () => {
  void initializeLiveUpdates();
});
