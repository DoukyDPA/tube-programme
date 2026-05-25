// =====================================================================
// api/sync-culture.js
// =====================================================================
// Synchronise les vidéos des 350+ chaînes "Culture" (ministère de la
// Culture) vers Firestore.
//
// Pour chaque thématique cult_xxx :
//   - on lit toutes les chaînes définies dans src/data/cultureChannels.js
//   - on récupère via l'API YouTube les 25 dernières vidéos longues (>3min)
//     en agrégeant les uploads de toutes les chaînes de la thématique
//   - on écrit le delta dans scopes/{themeId}/programs (ajouts + suppressions)
//
// Particularités vs sync.js classique :
//   - Source = liste figée de handles, pas les programs déjà en base
//   - Limite = 25 vidéos par thématique (pas par chaîne)
//   - Filtrage durée >= 180s, idem version standard
//
// Auth Firestore : signInAnonymously, donc les rules doivent autoriser
// la lecture publique sur scopes/{scopeId}/programs (déjà le cas) et la
// LECTURE/ÉCRITURE seulement pour les admins. Or ici on tourne côté serveur
// avec un compte standard, donc on a besoin que les rules autorisent
// l'écriture aussi avec un custom claim "admin", ou alors on utilise
// firebase-admin avec une service account.
//
// Choix retenu : firebase-admin via firebase-admin-key.json (déjà utilisé
// par scripts/migrate-to-v2.js). Bypass les rules, exécution serveur only.
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  CULTURE_THEMES,
  CULTURE_CHANNELS,
  CULTURE_VIDEOS_PER_THEME,
} from '../src/data/cultureChannels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---- Init Firebase Admin (singleton) ----
const initAdmin = () => {
  if (getApps().length > 0) return getFirestore();
  // Service account peut venir de fichier OU de variable d'env (Railway/Vercel)
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

const parseDuration = (duration) => {
  if (!duration) return 0;
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (
    parseInt(m[1] || 0, 10) * 3600 +
    parseInt(m[2] || 0, 10) * 60 +
    parseInt(m[3] || 0, 10)
  );
};

const MIN_DURATION_S = 180;

// Charge le mapping handle -> { channelId, themeId, name }
const loadResolved = () => {
  const p = join(__dirname, '..', 'scripts', 'culture-channels-resolved.json');
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(
      'culture-channels-resolved.json introuvable. Exécute d\'abord :\n  node scripts/seed-culture-channels.js'
    );
    return {};
  }
};

// Pour une chaîne YouTube (channelId UC...), retourne les vidéos récentes
// d'une durée >= MIN_DURATION_S, jusqu'à `limit`.
async function fetchRecentLongVideos(channelId, apiKey, limit = 30) {
  const playlistId = channelId.replace(/^UC/, 'UU');
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${apiKey}&playlistId=${playlistId}&part=contentDetails,snippet&maxResults=${Math.min(
    limit,
    50
  )}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    console.warn(`  ⚠️  ${channelId} : ${data.error.message}`);
    return [];
  }
  if (!data.items) return [];

  const videoIds = data.items.map((v) => v.contentDetails.videoId).join(',');
  if (!videoIds) return [];

  const detRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&id=${videoIds}&part=contentDetails,snippet`
  );
  const detData = await detRes.json();

  const long = [];
  for (const it of data.items) {
    const det = detData.items?.find((d) => d.id === it.contentDetails.videoId);
    if (!det) continue;
    if (parseDuration(det.contentDetails.duration) < MIN_DURATION_S) continue;
    long.push({
      youtubeId: it.contentDetails.videoId,
      channelId,
      publishedAt: new Date(it.snippet.publishedAt).getTime(),
      title: it.snippet.title,
    });
  }
  return long;
}

export default async function handler(req, res) {
  // Priorité : clé dédiée Culture, sinon clé principale
  const YOUTUBE_API_KEY =
    process.env.VITE_YOUTUBE_API_KEY_CULTURE || process.env.VITE_YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    return res?.status(500).json({
      error: 'VITE_YOUTUBE_API_KEY_CULTURE (ou VITE_YOUTUBE_API_KEY) manquante',
    });
  }

  const db = initAdmin();
  const resolved = loadResolved();
  // Map themeId -> [ { handle, channelId, name }, ... ]
  const byTheme = {};
  for (const [handle, info] of Object.entries(resolved)) {
    if (!info.channelId || !info.themeId) continue;
    if (!byTheme[info.themeId]) byTheme[info.themeId] = [];
    byTheme[info.themeId].push({
      handle,
      channelId: info.channelId,
      name: info.name,
    });
  }

  const report = {};
  let totalAdded = 0;
  let totalDeleted = 0;

  for (const theme of CULTURE_THEMES) {
    const themeId = theme.id;
    const channels = byTheme[themeId] || [];
    if (channels.length === 0) {
      report[themeId] = { added: 0, deleted: 0, skipped: 'pas de chaînes résolues' };
      continue;
    }

    // 1. Récupère les uploads de toutes les chaînes de la thématique
    const candidates = [];
    for (const ch of channels) {
      try {
        const v = await fetchRecentLongVideos(ch.channelId, YOUTUBE_API_KEY, 10);
        candidates.push(...v);
      } catch (e) {
        console.warn(`  ⚠️  Erreur fetch ${ch.handle}: ${e.message}`);
      }
    }

    // 2. Garde uniquement les 25 plus récentes au global
    candidates.sort((a, b) => b.publishedAt - a.publishedAt);
    const top = candidates.slice(0, CULTURE_VIDEOS_PER_THEME);
    const topIds = new Set(top.map((v) => v.youtubeId));

    // 3. Lit l'existant dans Firestore
    const existingSnap = await db
      .collection('scopes')
      .doc(themeId)
      .collection('programs')
      .get();

    const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const existingIds = new Set(existing.map((p) => p.youtubeId));

    // 4. Delta
    const toAdd = top.filter((v) => !existingIds.has(v.youtubeId));
    const toDelete = existing.filter((p) => !topIds.has(p.youtubeId));

    // 5. Writes batchés (max 500 par batch Firestore)
    let added = 0;
    let deleted = 0;
    const colRef = db.collection('scopes').doc(themeId).collection('programs');

    for (let i = 0; i < toAdd.length; i += 400) {
      const batch = db.batch();
      for (const v of toAdd.slice(i, i + 400)) {
        const ref = colRef.doc();
        batch.set(ref, {
          youtubeId: v.youtubeId,
          channelId: v.channelId,
          categoryId: themeId,
          addedBy: 'culture-sync',
          pitch: '',
          createdAt: Date.now(),
          publishedAt: v.publishedAt,
          avgScore: 0,
        });
        added++;
      }
      await batch.commit();
    }

    for (let i = 0; i < toDelete.length; i += 400) {
      const batch = db.batch();
      for (const p of toDelete.slice(i, i + 400)) {
        batch.delete(colRef.doc(p.id));
        deleted++;
      }
      await batch.commit();
    }

    report[themeId] = { added, deleted, channels: channels.length };
    totalAdded += added;
    totalDeleted += deleted;
    console.log(
      `  ${theme.label} (${themeId}) : +${added} / -${deleted} sur ${channels.length} chaînes`
    );
  }

  const payload = {
    success: true,
    totalAdded,
    totalDeleted,
    report,
  };

  if (res?.status) {
    return res.status(200).json(payload);
  }
  return payload;
}
