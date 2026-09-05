// =====================================================================
// src/data/build.js
// =====================================================================
// Identité de la version qui tourne réellement dans le navigateur.
//
// Pourquoi : le 5 septembre 2026, trois appareils de Daniel se sont
// comportés différemment le même jour, chacun sur une version distincte
// sans qu'on puisse le savoir. Une application installée peut rester des
// jours sur un ancien code, servi par son service worker, et rien ne le
// dit. Diagnostiquer devient alors une suite de suppositions.
//
// Les deux constantes sont injectées à la compilation par vite.config.js.
// L'origine, elle, est lue au moment de l'affichage : sur quel domaine
// cette copie tourne-t-elle vraiment, ce qui est la deuxième question
// utile quand quelque chose cloche.
// =====================================================================

/* global __BUILD_ID__, __BUILD_TIME__ */

export const BUILD_ID =
  typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

export const BUILD_TIME =
  typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

export function buildDateLabel() {
  if (!BUILD_TIME) return 'version de développement';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    }).format(new Date(BUILD_TIME));
  } catch {
    return BUILD_TIME;
  }
}

export function currentOrigin() {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
}

// Ligne unique à montrer à quelqu'un qui signale un problème.
export function buildSignature() {
  const parts = [`Version du ${buildDateLabel()}`, BUILD_ID];
  const host = currentOrigin();
  if (host) parts.push(host);
  return parts.join(' · ');
}
