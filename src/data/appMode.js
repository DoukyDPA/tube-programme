// =====================================================================
// src/data/appMode.js
// =====================================================================
// Détecte sur quelle version de Tubiscope on tourne en fonction du domaine.
//
//   tubiscope.fr        -> mode 'culture'  (Tubiscope Culture)
//   tubiscope.com       -> mode 'standard' (Tubiscope + Tubiscope Studio)
//   autre (dev, preview) -> mode 'standard' par défaut
//
// Override possible :
//   - via querystring : ?mode=culture ou ?mode=standard
//   - via localStorage : clé 'tubiscope:forceMode' (pratique en dev)
// =====================================================================

export const MODE_STANDARD = 'standard';
export const MODE_CULTURE = 'culture';

export function detectAppMode() {
  if (typeof window === 'undefined') return MODE_STANDARD;

  // 1. Override par querystring
  try {
    const params = new URLSearchParams(window.location.search);
    const qs = params.get('mode');
    if (qs === MODE_CULTURE || qs === MODE_STANDARD) return qs;
  } catch {
    /* noop */
  }

  // 2. Override par localStorage
  try {
    const ls = window.localStorage.getItem('tubiscope:forceMode');
    if (ls === MODE_CULTURE || ls === MODE_STANDARD) return ls;
  } catch {
    /* noop */
  }

  // 3. Détection par domaine
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith('tubiscope.fr')) return MODE_CULTURE;
  return MODE_STANDARD;
}

// URL de l'autre version, pour le bandeau de découverte
export function otherModeUrl(currentMode) {
  if (currentMode === MODE_CULTURE) {
    return 'https://tubiscope.com';
  }
  return 'https://tubiscope.fr';
}
