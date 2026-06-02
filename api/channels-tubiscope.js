// =====================================================================
// api/channels-tubiscope.js
// =====================================================================
// Endpoint Express qui sert la liste des chaînes Tubiscope (scopes
// éditeur) groupées par categoryId. Pendant strict de
// api/channels-culture.js, juste avec where('mode', '==', 'tubiscope').
//
// Pourquoi : l'AdminPanel React doit afficher TOUTES les chaînes
// déclarées dans /channels pour un scope donné, pas seulement celles qui
// ont déjà des vidéos synchronisées dans scopes/{scopeId}/programs.
// Sans ça, une chaîne nouvellement ajoutée ou momentanément vide
// disparaît de l'admin.
//
// Format de réponse :
//   { success: true, data: { [categoryId]: [ { name, handle, channelId } ] },
//     cached: bool, stale?: bool, generatedAt: number }
//
// Stratégie cache : 1h en mémoire, stale-while-error si Firestore casse.
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

let cache = null; // { data, timestamp }

const initAdmin = () => {
  if (getApps().length > 0) return getFirestore();
  let credential;
  if (process.env.FIREBASE_ADMIN_KEY_JSON) {
    credential = cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY_JSON));
  } else {
    const keyPath = join(__dirname, '..', 'firebase-admin-key.json');
    const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
    credential = cert(sa);
  }
  initializeApp({ credential });
  return getFirestore();
};

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

async function fetchFromFirestore() {
  const db = initAdmin();
  const snap = await db
    .collection('channels')
    .where('mode', '==', 'tubiscope')
    .get();
  const docs = snap.docs.map((d) => d.data());
  return groupByTheme(docs);
}

export default async function handler(req, res) {
  const now = Date.now();

  // Cache frais : on sert sans toucher Firestore.
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return res.status(200).json({
      success: true,
      data: cache.data,
      cached: true,
      generatedAt: cache.timestamp,
    });
  }

  // Sinon on tente une lecture Firestore.
  try {
    const data = await fetchFromFirestore();
    cache = { data, timestamp: now };
    return res.status(200).json({
      success: true,
      data,
      cached: false,
      generatedAt: now,
    });
  } catch (err) {
    console.warn('channels-tubiscope: lecture Firestore échouée.', err.message);
    // Stale-while-error : on a un vieux cache, on le sert plutôt que de planter.
    if (cache) {
      return res.status(200).json({
        success: true,
        data: cache.data,
        cached: true,
        stale: true,
        generatedAt: cache.timestamp,
      });
    }
    return res
      .status(500)
      .json({ success: false, error: err.message || 'Lecture Firestore impossible.' });
  }
}
