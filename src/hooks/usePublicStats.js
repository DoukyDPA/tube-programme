// =====================================================================
// src/hooks/usePublicStats.js
// =====================================================================
// Nombre de chaînes et de thématiques par mode, lu sur /api/stats.
//
// Ces chiffres sont cités dans le Guide, sur l'écran de connexion et
// dans la passerelle entre les deux Tubiscope. Ils changent à chaque
// ajout ou retrait de chaîne depuis l'admin : les écrire en dur, c'est
// se garantir un texte faux au bout de deux semaines.
//
// L'endpoint est public (pas d'authentification) et servi depuis un
// cache mémoire côté serveur, donc l'appeler ne coûte rien. Cache module
// + TTL ici aussi : un seul fetch par session.
// =====================================================================

import { useEffect, useState } from 'react';

const CLIENT_TTL_MS = 10 * 60 * 1000; // 10 min

// Repli affiché tant que la réponse n'est pas arrivée, ou si l'endpoint
// est injoignable. Valeurs du 5 septembre 2026 : elles évitent un trou
// dans une phrase, rien de plus.
const FALLBACK = {
  culture: { channels: 120, themes: 11 },
  tubiscope: { channels: 26, themes: 5 },
};

let cache = null;
let cachedAt = 0;
let inflight = null;
const subscribers = new Set();

async function fetchStats() {
  const res = await fetch('/api/stats', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.success) throw new Error('Réponse invalide');
  return {
    culture: body.culture || FALLBACK.culture,
    tubiscope: body.tubiscope || FALLBACK.tubiscope,
  };
}

function load() {
  if (inflight) return inflight;
  inflight = fetchStats()
    .then((data) => {
      cache = data;
      cachedAt = Date.now();
      subscribers.forEach((set) => set(data));
      return data;
    })
    .catch((err) => {
      console.warn('usePublicStats : chargement échoué.', err.message);
      return cache || FALLBACK;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function usePublicStats() {
  const [data, setData] = useState(() => cache || FALLBACK);

  useEffect(() => {
    subscribers.add(setData);
    const fresh = cache && Date.now() - cachedAt < CLIENT_TTL_MS;
    if (fresh) setData(cache);
    else load();
    return () => {
      subscribers.delete(setData);
    };
  }, []);

  return data;
}
