// =====================================================================
// src/hooks/useBackButtonClose.js
// =====================================================================
// Intercepte le bouton « Précédent » du navigateur pour fermer une
// modale au lieu de quitter l'app. Sans ce hook, sur une SPA, le back
// fait carrément sortir, ce qui est très perturbant sur mobile.
//
// Fonctionnement :
//   - À l'ouverture, on pousse une entrée d'historique « bidon » dont
//     le state porte un marqueur unique (tag).
//   - Quand le navigateur tire un popstate, on intercepte et on appelle
//     onClose au lieu de naviguer plus loin.
//   - Si la modale se ferme via X / Échap / clic sur le fond, le cleanup
//     consomme l'entrée poussée pour garder l'historique propre.
//   - Si la modale se ferme parce que l'utilisateur a déjà cliqué back,
//     l'entrée a déjà été consommée, on ne fait rien de plus.
//
// Bonus : Échap déclenche aussi onClose.
//
// Usage :
//   useBackButtonClose(isOpen, onClose);
//
// Le tag par défaut suffit. Si tu empiles plusieurs modales en même
// temps, passe un tag distinct pour chacune.
// =====================================================================

import { useEffect } from 'react';

export default function useBackButtonClose(isOpen, onClose, tag = 'modal') {
  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === 'undefined') return;

    window.history.pushState({ tubiscopeModal: tag }, '');

    const handlePop = () => {
      onClose?.();
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    window.addEventListener('popstate', handlePop);
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('popstate', handlePop);
      window.removeEventListener('keydown', handleKey);
      // Consomme l'entrée qu'on a poussée, sauf si elle a déjà été
      // consommée par un popstate (cas où le user a tapé Précédent).
      if (window.history.state?.tubiscopeModal === tag) {
        window.history.back();
      }
    };
  }, [isOpen, onClose, tag]);
}
