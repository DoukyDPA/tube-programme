// =====================================================================
// src/hooks/useCultureChannels.js
// =====================================================================
// Hook React qui s'abonne en live à la collection /channels (Firestore)
// pour le mode 'culture'. Retourne un map { themeId -> [chaînes] }
// où chaque chaîne est { name, handle, channelId }.
//
// Source de vérité pour l'UI Culture : sidebar (compteur), liste des
// chaînes d'une thématique, sélecteur de thématiques, audit admin.
// Les chaînes supprimées via /admin-channels.html disparaissent
// immédiatement de l'interface.
//
// Listener partagé : un seul onSnapshot par session, qu'importe le
// nombre d'usages du hook. Idem useCategories.
// =====================================================================

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

let cache = null; // map themeId -> array
let unsub = null;
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
  // Tri alphabétique par nom dans chaque thématique
  for (const id of Object.keys(byTheme)) {
    byTheme[id].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
    );
  }
  return byTheme;
}

function startListener() {
  if (unsub) return;
  try {
    const q = query(collection(db, 'channels'), where('mode', '==', 'culture'));
    unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        cache = groupByTheme(docs);
        subscribers.forEach((set) => set(cache));
      },
      (err) => {
        console.warn('useCultureChannels: snapshot échoué.', err.message);
      }
    );
  } catch (e) {
    console.warn('useCultureChannels: listener non initialisé.', e.message);
  }
}

export function useCultureChannels() {
  const [data, setData] = useState(() => cache || {});

  useEffect(() => {
    subscribers.add(setData);
    startListener();
    if (cache) setData(cache);

    return () => {
      subscribers.delete(setData);
      // On laisse le listener vivant pour les autres consommateurs.
      // S'il n'en reste plus, on coupe pour libérer la connexion.
      if (subscribers.size === 0 && unsub) {
        unsub();
        unsub = null;
      }
    };
  }, []);

  return data;
}
