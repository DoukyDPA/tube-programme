// =====================================================================
// api/public-snapshot.js
// =====================================================================
// Endpoint Express qui sert, en une seule requête et SANS authentifica-
// tion, tout ce qu'il faut pour afficher Tubiscope en lecture :
// les catégories d'un mode et les programmes de chaque scope.
//
// Pourquoi : les programmes ne changent qu'une fois par jour, au cron de
// 8h. Les lire côté client avec onSnapshot (listener temps réel) coûtait
// une lecture Firestore par document et par visiteur, soit ~300 lectures
// par session. Le quota gratuit de 50 000 lectures/jour était donc
// atteint autour de 150 visites quotidiennes.
//
// Ici la lecture est faite une seule fois côté serveur via firebase-admin
// (bypass des rules), puis servie depuis un cache mémoire. Le coût
// Firestore devient constant, indépendant du nombre de visiteurs.
//
// Format de réponse :
//   { success: true, mode, generatedAt, categories: [...],
//     programs: { [scopeId]: [ {...} ] }, cached: bool, stale?: bool }
//
// Même contrat que api/channels-culture.js : stale-while-error, cache
// mémoire, TTL. Le cache est aussi invalidé explicitement à la fin du
// cron de 8h (cf. server.js) pour que les nouveautés sortent tout de
// suite.
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Le contenu ne bouge qu'au cron de 8h, qui invalide le cache derrière
// lui. Le TTL n'est donc qu'un filet : il borne le retard que verrait un
// visiteur après une édition faite à la main depuis l'admin (l'admin,
// lui, lit Firestore en direct et voit ses changements tout de suite).
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h, comme api/channels-culture.js

// Garde-fou sur la taille de la réponse. Aucun scope n'approche ce
// plafond aujourd'hui (le plus gros est à ~90 programmes), il protège
// seulement contre une dérive future.
const MAX_PROGRAMS_PER_SCOPE = 150;

const MODES = ['culture', 'tubiscope'];

const caches = new Map(); // mode -> { data, timestamp }

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

// On ne renvoie que les champs utiles à l'affichage. addedBy et avgScore
// restent en base mais n'ont rien à faire dans une réponse publique.
function slimProgram(id, d) {
  const out = {
    id,
    youtubeId: d.youtubeId,
    channelId: d.channelId || '',
    categoryId: d.categoryId || '',
    createdAt: d.createdAt || 0,
    publishedAt: d.publishedAt || d.createdAt || 0,
    title: d.title || '',
    creatorName: d.creatorName || '',
  };
  // embeddable n'est renseigné que depuis septembre 2026. Absent = true,
  // même convention que VideoModal.
  if (d.embeddable === false) out.embeddable = false;
  if (d.pitch) out.pitch = d.pitch;
  return out;
}

// Déduplication par youtubeId (un sync interrompu peut laisser deux docs
// pour la même vidéo), puis tri par date et plafonnement.
function normalizeScope(docs) {
  const byYid = new Map();
  for (const p of docs) {
    const key = p.youtubeId || p.id;
    const existing = byYid.get(key);
    if (!existing || (p.createdAt || 0) > (existing.createdAt || 0)) {
      byYid.set(key, p);
    }
  }
  return Array.from(byYid.values())
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, MAX_PROGRAMS_PER_SCOPE);
}

async function fetchFromFirestore(mode) {
  const db = initAdmin();

  const catSnap = await db
    .collection('categories')
    .where('mode', '==', mode)
    .get();

  const categories = catSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Lectures en parallèle : une par scope, sur le serveur, une seule fois
  // pour tous les visiteurs.
  const programs = {};
  await Promise.all(
    categories.map(async (cat) => {
      const snap = await db
        .collection('scopes')
        .doc(cat.id)
        .collection('programs')
        .get();
      programs[cat.id] = normalizeScope(
        snap.docs.map((d) => slimProgram(d.id, d.data()))
      );
    })
  );

  return { categories, programs };
}

// Invalide le cache d'un mode, ou de tous si mode est omis. Appelé après
// le cron de 8h et après les syncs déclenchées à la main.
export function invalidateSnapshot(mode) {
  if (mode) caches.delete(mode);
  else caches.clear();
}

export default async function handler(req, res) {
  const mode = (req.query?.mode || 'culture').toString();
  if (!MODES.includes(mode)) {
    return res
      .status(400)
      .json({ success: false, error: `Mode inconnu : ${mode}` });
  }

  const now = Date.now();
  const cache = caches.get(mode);

  const send = (payload, generatedAt) => {
    // Le navigateur peut garder la réponse 15 min. Au-delà il revalide,
    // et l'ETag d'Express renvoie un 304 si rien n'a changé.
    res.set('Cache-Control', 'public, max-age=900');
    return res.status(200).json({ ...payload, mode, generatedAt });
  };

  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return send({ success: true, ...cache.data, cached: true }, cache.timestamp);
  }

  try {
    const data = await fetchFromFirestore(mode);
    caches.set(mode, { data, timestamp: now });
    return send({ success: true, ...data, cached: false }, now);
  } catch (err) {
    console.warn(`public-snapshot (${mode}) : lecture Firestore échouée.`, err.message);
    if (cache) {
      return send(
        { success: true, ...cache.data, cached: true, stale: true },
        cache.timestamp
      );
    }
    return res
      .status(500)
      .json({ success: false, error: err.message || 'Lecture Firestore impossible.' });
  }
}
