// Enregistrement du service worker généré par vite-plugin-pwa.
// Ce fichier est importé une seule fois depuis main.jsx.
// Il déclenche un event custom 'swUpdate' que PWAPrompt écoute pour proposer le rechargement.

import { registerSW } from 'virtual:pwa-register';

export function setupServiceWorker() {
  // Pas de SW en dev pour pas embêter le HMR Vite
  if (import.meta.env.DEV) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      // Nouvelle version dispo, on prévient l'UI
      window.dispatchEvent(new CustomEvent('swUpdate'));
      // On garde une référence globale au cas où on veuille forcer le reload
      window.__updateSW = updateSW;
    },
    onOfflineReady() {
      // Première installation réussie, l'app fonctionne hors ligne
      console.log('[Tubiscope] Mode hors ligne prêt.');
    },
    onRegisterError(err) {
      console.warn('[Tubiscope] Service worker non enregistré :', err);
    }
  });
}
