import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[App] New version available! Reloading...');
              // With autoUpdate in VitePWA, it will skipWaiting and reload automatically.
              // We just log it here for debugging.
            }
          });
        }
      });
    }).catch(() => {});
    
    console.log('[App] Current Build Time:', __BUILD_TIME__);
    
    // Request notification permission for background parsing
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Once the SW is controlling this page, send the stored auth token so it
    // can make authenticated API calls for background receipt parsing.
    navigator.serviceWorker.ready.then(() => {
      const token = localStorage.getItem('accessToken');
      if (token && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'AUTH_UPDATE',
          token,
          apiBase: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api/v1',
        });
      }
    });
  });
}
