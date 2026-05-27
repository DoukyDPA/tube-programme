// =====================================================================
// src/hooks/useCategories.js
// =====================================================================
// Hook React qui charge les catégories depuis /categories (Firestore).
// Filtré par mode ('tubiscope' ou 'culture').
//
// Cache mémoire au niveau module : un seul fetch par mode et par session,
// même si le hook est utilisé dans plusieurs composants. Re-fetch
// possible via refresh().
//
// Fallback hardcodé en cas d'échec, pour que l'app continue de marcher.
// =====================================================================

import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

const cache = new Map(); // mode -> array de catégories
const subscribers = new Map(); // mode -> Set de setState

// Fallback hardcodé pour résilience. Doit rester aligné avec
// scripts/migrate-channels-and-categories.js.
const FALLBACK = {
  tubiscope: [
    { id: 'divertissement', label: 'Divertissement Scope', icon: 'clapperboard', mode: 'tubiscope', order: 1 },
    { id: 'ia',             label: 'IA & Tech Scope',      icon: 'cpu',          mode: 'tubiscope', order: 2 },
    { id: 'lecture',        label: 'Culture Scope',        icon: 'book',         mode: 'tubiscope', order: 3 },
    { id: 'foot',           label: 'Economie Scope',       icon: 'trophy',       mode: 'tubiscope', order: 4 },
    { id: 'interviews',     label: 'Talks Scope',          icon: 'mic',          mode: 'tubiscope', order: 5 },
  ],
  culture: [
    { id: 'cult_lettres',       label: 'Lettres & Littérature',           icon: 'book',        mode: 'culture', order: 1 },
    { id: 'cult_langues',       label: 'Langue française & Linguistique', icon: 'languages',   mode: 'culture', order: 2 },
    { id: 'cult_histoire',      label: 'Histoire',                        icon: 'landmark',    mode: 'culture', order: 3 },
    { id: 'cult_geog',          label: 'Géographie & Géopolitique',       icon: 'globe',       mode: 'culture', order: 4 },
    { id: 'cult_societe',       label: 'Société, Droit & Civique',        icon: 'landmark',    mode: 'culture', order: 5 },
    { id: 'cult_sciences',      label: 'Philosophie & Esprit critique',   icon: 'brain',       mode: 'culture', order: 6 },
    { id: 'cult_eco',           label: 'Économie',                        icon: 'trophy',      mode: 'culture', order: 7 },
    { id: 'cult_math',          label: 'Mathématiques',                   icon: 'calculator',  mode: 'culture', order: 8 },
    { id: 'cult_physique',      label: 'Physique, Chimie & Astronomie',   icon: 'atom',        mode: 'culture', order: 9 },
    { id: 'cult_bio',           label: 'Biologie, Médecine & Paléontologie', icon: 'microscope', mode: 'culture', order: 10 },
    { id: 'cult_tech',          label: 'Technologie & Informatique',      icon: 'monitor',     mode: 'culture', order: 11 },
    { id: 'cult_art',           label: "Arts & Histoire de l'art",        icon: 'palette',     mode: 'culture', order: 12 },
    { id: 'cult_musique',       label: 'Musique',                         icon: 'music',       mode: 'culture', order: 13 },
    { id: 'cult_audiovisuel',   label: 'Audiovisuel, Cinéma & Jeu vidéo', icon: 'clapperboard', mode: 'culture', order: 14 },
    { id: 'cult_sport',         label: 'Sport',                           icon: 'trophy',      mode: 'culture', order: 15 },
    { id: 'cult_recherche',     label: 'Recherche & Culture générale',    icon: 'search',      mode: 'culture', order: 16 },
    { id: 'cult_psycho',        label: 'Psychologie',                     icon: 'heart',       mode: 'culture', order: 17 },
    { id: 'cult_apprentissage', label: 'Méthodologie & Apprentissage',    icon: 'graduation',  mode: 'culture', order: 18 },
    { id: 'cult_enfants',       label: 'YouTube pour les plus jeunes',    icon: 'baby',        mode: 'culture', order: 19 },
  ],
};

async function fetchCategories(mode) {
  try {
    const snap = await getDocs(
      query(collection(db, 'categories'), where('mode', '==', mode))
    );
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    return rows.length > 0 ? rows : FALLBACK[mode] || [];
  } catch (e) {
    console.warn(`useCategories: fetch échoué pour mode=${mode}, fallback hardcodé.`, e.message);
    return FALLBACK[mode] || [];
  }
}

function notify(mode, data) {
  cache.set(mode, data);
  const subs = subscribers.get(mode);
  if (subs) subs.forEach((set) => set(data));
}

export function useCategories(mode) {
  const [data, setData] = useState(() => cache.get(mode) || FALLBACK[mode] || []);

  useEffect(() => {
    let cancelled = false;
    if (!subscribers.has(mode)) subscribers.set(mode, new Set());
    subscribers.get(mode).add(setData);

    // Si pas encore en cache, lance le fetch
    if (!cache.has(mode)) {
      fetchCategories(mode).then((rows) => {
        if (cancelled) return;
        notify(mode, rows);
      });
    } else {
      setData(cache.get(mode));
    }

    return () => {
      cancelled = true;
      subscribers.get(mode)?.delete(setData);
    };
  }, [mode]);

  return data;
}

// Force un re-fetch (utile après un édit dans l'admin)
export async function refreshCategories(mode) {
  const rows = await fetchCategories(mode);
  notify(mode, rows);
  return rows;
}
