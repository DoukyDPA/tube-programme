// =====================================================================
// src/hooks/usePublicSnapshot.js
// =====================================================================
// Source unique des données publiques d'un mode ('culture' ou
// 'tubiscope') : catégories + programmes de chaque scope, en une seule
// requête sur /api/snapshot.
//
// Pourquoi ce hook existe : les programmes ne changent qu'au cron de 8h.
// Les écouter en temps réel avec onSnapshot coûtait une lecture Firestore
// par document et par visiteur. Ici, le serveur lit une fois et met en
// cache, le client télécharge un JSON. Coût Firestore constant, quel que
// soit le nombre de visiteurs, et pas besoin d'être connecté pour lire.
//
// Cache module + TTL : un seul fetch par mode et par session, partagé
// entre tous les composants qui consomment le hook.
//
// L'admin, lui, continue de lire Firestore en direct (cf. App.jsx et
// CultureApp.jsx) : il doit voir ses éditions immédiatement.
// =====================================================================

import { useEffect, useState } from 'react';

const CLIENT_TTL_MS = 10 * 60 * 1000; // 10 min

const EMPTY = { categories: [], programs: {}, generatedAt: 0 };

const cache = new Map();     // mode -> { categories, programs, generatedAt }
const cachedAt = new Map();  // mode -> timestamp
const inflight = new Map();  // mode -> Promise
const subscribers = new Map(); // mode -> Set de setState

async function fetchSnapshot(mode) {
  const res = await fetch(`/api/snapshot?mode=${encodeURIComponent(mode)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.success) throw new Error(body?.error || 'Réponse invalide');
  return {
    categories: Array.isArray(body.categories) ? body.categories : [],
    programs: body.programs && typeof body.programs === 'object' ? body.programs : {},
    generatedAt: body.generatedAt || Date.now(),
  };
}

function notify(mode, data) {
  cache.set(mode, data);
  cachedAt.set(mode, Date.now());
  subscribers.get(mode)?.forEach((set) => set(data));
}

// Charge (ou renvoie le chargement en cours) le snapshot d'un mode.
export function loadSnapshot(mode) {
  const pending = inflight.get(mode);
  if (pending) return pending;

  const p = fetchSnapshot(mode)
    .then((data) => {
      notify(mode, data);
      return data;
    })
    .catch((err) => {
      console.warn(`usePublicSnapshot (${mode}) : chargement échoué.`, err.message);
      // On ne met rien en cache : le prochain rendu retentera.
      return cache.get(mode) || EMPTY;
    })
    .finally(() => {
      inflight.delete(mode);
    });

  inflight.set(mode, p);
  return p;
}

// Accès synchrone au cache, pour les modules qui ne sont pas des hooks
// (useCategories notamment).
export function getCachedSnapshot(mode) {
  const data = cache.get(mode);
  if (!data) return null;
  if (Date.now() - (cachedAt.get(mode) || 0) > CLIENT_TTL_MS) return null;
  return data;
}

// Vide le cache et relance un chargement. Utile après une édition admin.
export function refreshSnapshot(mode) {
  cache.delete(mode);
  cachedAt.delete(mode);
  return loadSnapshot(mode);
}

// Hook principal : renvoie { categories, programs, generatedAt, loaded }.
export function usePublicSnapshot(mode, { enabled = true } = {}) {
  const [data, setData] = useState(() => cache.get(mode) || EMPTY);

  useEffect(() => {
    if (!enabled) return undefined;

    if (!subscribers.has(mode)) subscribers.set(mode, new Set());
    subscribers.get(mode).add(setData);

    const fresh = getCachedSnapshot(mode);
    if (fresh) setData(fresh);
    else loadSnapshot(mode);

    return () => {
      subscribers.get(mode)?.delete(setData);
    };
  }, [mode, enabled]);

  return {
    ...data,
    loaded: Object.keys(data.programs || {}).length > 0,
  };
}

// Raccourci quand seul le flux de programmes intéresse le composant.
// Les champs _source et _scopeId reproduisent ce que produisaient les
// listeners Firestore, pour que le reste de l'UI ne change pas.
export function usePublicPrograms(mode, { enabled = true } = {}) {
  const { programs, loaded, generatedAt } = usePublicSnapshot(mode, { enabled });

  const [decorated, setDecorated] = useState({});

  useEffect(() => {
    const next = {};
    for (const [scopeId, list] of Object.entries(programs || {})) {
      next[scopeId] = (list || []).map((p) => ({
        ...p,
        _source: 'scope',
        _scopeId: scopeId,
      }));
    }
    setDecorated(next);
  }, [generatedAt, programs]);

  return { programs: decorated, loaded };
}
