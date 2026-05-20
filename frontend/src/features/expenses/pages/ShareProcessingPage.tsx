import { useEffect } from 'react';

export default function ShareProcessingPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Go back to the app the user was in before sharing.
      // On Android, if there's no prior PWA history this dismisses the share activity.
      window.history.back();
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-background">
      <img src="/logo-192.png" alt="Spendly" className="w-14 h-14 rounded-2xl opacity-90" />

      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <p className="text-sm font-medium text-white/80 mt-1">Parsing your receipt…</p>
        <p className="text-xs text-white/40">We'll notify you when it's ready</p>
      </div>
    </div>
  );
}
