// =====================================================================
// src/data/appMode.js
// =====================================================================
// Sur quelle version de Tubiscope tourne-t-on ?
//
//   /culture        -> mode 'culture'  (Tubiscope Culture)
//   tout le reste   -> mode 'standard' (Tubiscope + Tubiscope Studio)
//
// Le mode se lit désormais dans le CHEMIN, plus dans le domaine. Raison :
// deux domaines, c'est deux origines pour le navigateur, donc deux
// stockages séparés. Une session Firebase ouverte sur tubiscope.com ne
// vaut rien sur tubiscope.fr, et l'utilisateur doit s'inscrire deux fois
// pour un site qui est le même, avec la même base. Une seule origine
// réelle règle le problème définitivement.
//
// tubiscope.fr reste ce qu'il a toujours été dans l'idée : un raccourci
// vers la partie Culture. La redirection est faite côté serveur
// (server.js), et la détection par domaine ci-dessous sert de filet le
// temps que les caches et les raccourcis existants s'alignent.
//
// Override possible :
//   - via querystring : ?mode=culture ou ?mode=standard
//   - via localStorage : clé 'tubiscope:forceMode' (pratique en dev)
// =====================================================================

export const MODE_STANDARD = 'standard';
export const MODE_CULTURE = 'culture';

// Chemin de la partie Culture. Une seule définition, reprise par les
// liens de l'interface et par la redirection serveur.
export const CULTURE_PATH = '/culture';

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

  // 3. Détection par le chemin
  const path = (window.location.pathname || '').toLowerCase();
  if (path === CULTURE_PATH || path.startsWith(`${CULTURE_PATH}/`)) {
    return MODE_CULTURE;
  }

  // 4. Filet : ancien domaine dédié, si la redirection serveur n'a pas
  //    joué (cache, service worker installé avant la bascule).
  const host = (window.location.hostname || '').toLowerCase();
  if (host.endsWith('tubiscope.fr')) return MODE_CULTURE;

  return MODE_STANDARD;
}

// Chemin d'accueil d'un mode, sur l'origine courante.
export function modePath(mode) {
  return mode === MODE_CULTURE ? CULTURE_PATH : '/';
}

// Chemin de l'autre version, pour la passerelle. Relatif : même origine,
// donc même session, même compte, même application installée.
export function otherModeUrl(currentMode) {
  return modePath(currentMode === MODE_CULTURE ? MODE_STANDARD : MODE_CULTURE);
}
