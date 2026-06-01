// =====================================================================
// api/channels-culture.js
// =====================================================================
// Endpoint Express qui sert la liste des chaînes Tubiscope Culture
// groupées par categoryId. Optimisation quota Firestore : la lecture
// est faite côté serveur via firebase-admin (bypass rules) et mise en
// cache mémoire avec TTL. Les clients tapent juste cet endpoint, ce
// qui évite que chaque ouverture de Culture déclenche un read par
// chaîne (~500 reads × N users).
//
// Format de réponse :
//   { success: true, data: { [categoryId]: [ { name, handle, channelId } ] },
//     cached: bool, stale?: bool, generatedAt: number }
//
// En cas d'échec Firestore, on sert le cache même périmé tant qu'il
// existe (stale-while-error). Si pas de cache, on renvoie 500.
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
    .where('mode', '==', 'culture')
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
    console.warn('channels-culture: lecture Firestore échouée.', err.message);
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
