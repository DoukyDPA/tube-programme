import React, { useEffect, useState } from 'react';
import { RefreshCw, X, Wifi, WifiOff } from 'lucide-react';

/**
 * Bandeau PWA. Deux rôles :
 * 1. Notifier une nouvelle version dispo (recharger pour l'avoir)
 * 2. Notifier l'état hors ligne (Tubiscope reste utilisable, mais pas de nouvelles vidéos)
 *
 * Le service worker est enregistré automatiquement par vite-plugin-pwa.
 * Ici on écoute juste les événements navigator.onLine et un custom event swUpdate
 * qu'on déclenche depuis le bootstrap du SW (voir src/registerSW.js).
 */
export default function PWAPrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  useEffect(() => {
    const onUpdate = () => setUpdateAvailable(true);
    const onOnline = () => { setIsOffline(false); setOfflineDismissed(false); };
    const onOffline = () => setIsOffline(true);

    window.addEventListener('swUpdate', onUpdate);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('swUpdate', onUpdate);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const reload = () => window.location.reload();

  return (
    <>
      {updateAvailable && (
        <div className="fixed bottom-4 right-4 z-[100] bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm animate-in slide-in-from-bottom-2 duration-300">
          <RefreshCw size={18} className="shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Nouvelle version disponible</p>
            <p className="text-indigo-100 text-xs">Rechargez pour profiter des dernières améliorations.</p>
          </div>
          <button
            onClick={reload}
            className="bg-white text-indigo-700 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-50 shrink-0"
          >
            Recharger
          </button>
        </div>
      )}

      {isOffline && !offlineDismissed && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-amber-600/95 text-white px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 max-w-md backdrop-blur">
          <WifiOff size={16} className="shrink-0" />
          <span className="text-sm flex-1">Mode hors ligne. Les nouvelles vidéos seront chargées à la reconnexion.</span>
          <button
            onClick={() => setOfflineDismissed(true)}
            className="hover:opacity-70 shrink-0"
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
