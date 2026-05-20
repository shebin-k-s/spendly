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

      // Heartbeat: tells the SW that the app is actively open.
      // The SW uses this to decide between pre-fill (app open) and
      // background parse + notification (app closed) on share.
      const sendHeartbeat = () => {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'APP_HEARTBEAT' });
        }
      };
      
      sendHeartbeat();
      // Heartbeat every 1 minute while the app is open
      const intervalId = setInterval(sendHeartbeat, 60000);
      
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) sendHeartbeat();
      });

      // Cleanup interval if needed (though main.tsx is global)
      window.addEventListener('beforeunload', () => clearInterval(intervalId));
    });
  });
}
