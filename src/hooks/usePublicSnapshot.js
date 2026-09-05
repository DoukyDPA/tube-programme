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
// Résilience, apprise à la dure : la première version ne tentait la
// requête qu'une fois. Un seul échec, un conteneur qui redémarre, un
// tunnel de métro, et l'écran restait vide pour toujours, sans que rien
// ne réessaie ni ne le signale. Trois filets désormais :
//   1. jusqu'à trois tentatives, espacées ;
//   2. repli sur une lecture Firestore directe pour un utilisateur
//      connecté, c'est-à-dire l'ancien comportement, plus cher mais qui
//      marche ;
//   3. état d'erreur exposé à l'interface, plus reprise automatique au
//      retour du réseau ou de l'onglet.
//
// L'admin, lui, continue de lire Firestore en direct (cf. App.jsx et
// CultureApp.jsx) : il doit voir ses éditions immédiatement.
// =====================================================================

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';

const CLIENT_TTL_MS = 10 * 60 * 1000; // 10 min

// Trois tentatives : immédiate, puis 0,8 s, puis 2,5 s.
const RETRY_DELAYS_MS = [800, 2500];

const EMPTY = { categories: [], programs: {}, generatedAt: 0 };

const cache = new Map();     // mode -> { categories, programs, generatedAt }
const cachedAt = new Map();  // mode -> timestamp
const errors = new Map();    // mode -> Error | null
const inflight = new Map();  // mode -> Promise
const subscribers = new Map(); // mode -> Set de setState

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

// Dernier recours : la lecture que faisait l'application avant le
// snapshot. Coûteuse en quota, réservée au cas où l'endpoint est
// injoignable, et impossible sans compte (les règles Firestore exigent
// une session).
async function fetchFromFirestore(mode) {
  const catSnap = await getDocs(
    query(collection(db, 'categories'), where('mode', '==', mode))
  );
  const categories = catSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const programs = {};
  await Promise.all(
    categories.map(async (cat) => {
      const snap = await getDocs(collection(db, 'scopes', cat.id, 'programs'));
      // Même déduplication par youtubeId que côté serveur.
      const byYid = new Map();
      for (const d of snap.docs) {
        const p = { id: d.id, ...d.data() };
        const key = p.youtubeId || p.id;
        const seen = byYid.get(key);
        if (!seen || (p.createdAt || 0) > (seen.createdAt || 0)) byYid.set(key, p);
      }
      programs[cat.id] = Array.from(byYid.values()).sort(
        (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)
      );
    })
  );

  return { categories, programs, generatedAt: Date.now() };
}

function notify(mode, data, error) {
  if (data) {
    cache.set(mode, data);
    cachedAt.set(mode, Date.now());
  }
  errors.set(mode, error || null);
  const payload = { ...(data || cache.get(mode) || EMPTY), error: error || null };
  subscribers.get(mode)?.forEach((set) => set(payload));
}

// Charge (ou renvoie le chargement en cours) le snapshot d'un mode.
export function loadSnapshot(mode) {
  const pending = inflight.get(mode);
  if (pending) return pending;

  const run = (async () => {
    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const data = await fetchSnapshot(mode);
        notify(mode, data, null);
        return data;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          console.warn(
            `usePublicSnapshot (${mode}) : tentative ${attempt + 1} échouée (${err.message}), nouvel essai.`
          );
          await wait(RETRY_DELAYS_MS[attempt]);
        }
      }
    }

    // L'endpoint ne répond pas. Un utilisateur connecté peut encore lire
    // Firestore en direct : mieux vaut une page qui coûte cher qu'une
    // page vide.
    if (auth.currentUser) {
      try {
        console.warn(
          `usePublicSnapshot (${mode}) : endpoint injoignable, repli sur Firestore.`
        );
        const data = await fetchFromFirestore(mode);
        notify(mode, data, null);
        return data;
      } catch (err) {
        lastError = err;
      }
    }

    console.warn(`usePublicSnapshot (${mode}) : chargement échoué.`, lastError?.message);
    notify(mode, null, lastError || new Error('Chargement impossible'));
    return cache.get(mode) || EMPTY;
  })();

  const p = run.finally(() => inflight.delete(mode));
  inflight.set(mode, p);
  return p;
}

// Une connexion ouvre le repli Firestore, qui n'était pas disponible
// pour un visiteur. Si un mode est en erreur au moment où quelqu'un se
// connecte, on retente : c'est le seul moment où le résultat peut
// changer sans que le réseau ait bougé.
let authWatcherStarted = false;
function watchAuthForRecovery() {
  if (authWatcherStarted || typeof window === 'undefined') return;
  authWatcherStarted = true;
  onAuthStateChanged(auth, (u) => {
    if (!u) return;
    for (const [mode, err] of errors.entries()) {
      if (err) refreshSnapshot(mode);
    }
  });
}

// Accès synchrone au cache, pour les modules qui ne sont pas des hooks
// (useCategories notamment).
export function getCachedSnapshot(mode) {
  const data = cache.get(mode);
  if (!data) return null;
  if (Date.now() - (cachedAt.get(mode) || 0) > CLIENT_TTL_MS) return null;
  return data;
}

// Vide le cache et relance un chargement. Utile après une édition admin,
// et derrière le bouton « Réessayer » de l'interface.
export function refreshSnapshot(mode) {
  cache.delete(mode);
  cachedAt.delete(mode);
  errors.delete(mode);
  return loadSnapshot(mode);
}

// Hook principal : renvoie { categories, programs, generatedAt, loaded, error }.
export function usePublicSnapshot(mode, { enabled = true } = {}) {
  const [data, setData] = useState(() => ({
    ...(cache.get(mode) || EMPTY),
    error: errors.get(mode) || null,
  }));

  useEffect(() => {
    if (!enabled) return undefined;

    watchAuthForRecovery();

    if (!subscribers.has(mode)) subscribers.set(mode, new Set());
    subscribers.get(mode).add(setData);

    const fresh = getCachedSnapshot(mode);
    if (fresh) setData({ ...fresh, error: null });
    else loadSnapshot(mode);

    // Reprise automatique : si le dernier chargement a échoué, on
    // retente quand le réseau revient ou quand l'utilisateur revient sur
    // l'onglet. C'est le cas du téléphone qu'on rouvre.
    const retryIfBroken = () => {
      if (!errors.get(mode)) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      refreshSnapshot(mode);
    };
    window.addEventListener('online', retryIfBroken);
    document.addEventListener('visibilitychange', retryIfBroken);

    return () => {
      subscribers.get(mode)?.delete(setData);
      window.removeEventListener('online', retryIfBroken);
      document.removeEventListener('visibilitychange', retryIfBroken);
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
  const { programs, loaded, generatedAt, error } = usePublicSnapshot(mode, { enabled });

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

  return {
    programs: decorated,
    loaded,
    error,
    retry: () => refreshSnapshot(mode),
  };
}
