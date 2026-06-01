// =====================================================================
// src/hooks/useCultureChannels.js
// =====================================================================
// Hook React qui charge le map { themeId -> [chaînes] } pour le mode
// 'culture'. Source primaire : endpoint serveur /api/channels/culture,
// qui met /channels Firestore en cache mémoire (TTL 1h serveur). Source
// de repli : lecture Firestore directe (one-shot) si l'endpoint n'est
// pas joignable (dev sans Express lancé, déploiement statique sans
// backend, etc.).
//
// Cache module + TTL côté client : un seul fetch par session (TTL 5
// min), même si le hook est consommé dans plusieurs composants. Les
// abonnés sont notifiés en parallèle.
//
// Source de vérité pour l'UI Culture : sidebar (compteur), liste des
// chaînes d'une thématique, sélecteur de thématiques, audit admin.
// =====================================================================

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const CLIENT_TTL_MS = 5 * 60 * 1000; // 5 min
const ENDPOINT = '/api/channels/culture';

let cache = null;          // map themeId -> array
let cachedAt = 0;
let inflight = null;       // Promise en cours pour dédupliquer les appels
const subscribers = new Set();

function groupByTheme(docs) {
  const byTheme = {};
  for (const c of docs) {
    if (!c.categoryId) continue;
    (byTheme[c.categoryId] ||= []).push({
      name: c.name || c.handle || '',
      handle: c.handle || '',
      channelId: c.channelId || '',
    });
  }
  for (const id of Object.keys(byTheme)) {
    byTheme[id].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
    );
  }
  return byTheme;
}

async function fetchFromEndpoint() {
  const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.success || !body.data) throw new Error('Réponse invalide');
  return body.data;
}

async function fetchFromFirestore() {
  // Repli si l'endpoint serveur n'est pas joignable. Lecture one-shot,
  // pas de listener live, pour éviter de gonfler les reads.
  const snap = await getDocs(
    query(collection(db, 'channels'), where('mode', '==', 'culture'))
  );
  const docs = snap.docs.map((d) => d.data());
  return groupByTheme(docs);
}

async function loadChannels() {
  try {
    return await fetchFromEndpoint();
  } catch (e) {
    console.warn(
      'useCultureChannels: endpoint indisponible, fallback Firestore direct.',
      e.message
    );
    return await fetchFromFirestore();
  }
}

function notify(data) {
  cache = data;
  cachedAt = Date.now();
  subscribers.forEach((set) => set(data));
}

function refresh() {
  if (inflight) return inflight;
  inflight = loadChannels()
    .then((data) => {
      notify(data);
      return data;
    })
    .catch((err) => {
      console.warn('useCultureChannels: chargement échoué.', err.message);
      return cache || {};
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useCultureChannels() {
  const [data, setData] = useState(() => cache || {});

  useEffect(() => {
    subscribers.add(setData);

    const fresh = cache && Date.now() - cachedAt < CLIENT_TTL_MS;
    if (fresh) {
      setData(cache);
    } else {
      refresh();
    }

    return () => {
      subscribers.delete(setData);
    };
  }, []);

  return data;
}

// Force un re-fetch (utile après un édit dans l'admin).
export function refreshCultureChannels() {
  cache = null;
  cachedAt = 0;
  return refresh();
}
