// =====================================================================
// api/sync-culture.js
// =====================================================================
// Synchronise les vidéos des chaînes Tubiscope Culture vers Firestore.
//
// Source de vérité : collection /channels (mode = 'culture').
// Pour chaque catégorie culture (cult_xxx) :
//   - on lit les chaînes /channels où mode='culture' && categoryId=cult_xxx
//   - on agrège les uploads récents (>= 180s) de toutes ces chaînes
//   - on garde les CULTURE_VIDEOS_PER_THEME plus récentes
//   - on écrit le delta dans scopes/{themeId}/programs
// On met aussi à jour lastVideoAt et videoCount par chaîne dans /channels.
//
// Auth : firebase-admin via service account (bypass rules).
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Hardcodé pour éviter de dépendre de cultureChannels.js maintenant que
// /channels est la source de vérité.
const CULTURE_VIDEOS_PER_THEME = 25;
// Pour qu'une chaîne très active n'écrase pas toutes les autres dans
// une thématique, on cap à 5 vidéos par chaîne avant de prendre le top.
const MAX_PER_CHANNEL = 5;
const MIN_DURATION_S = 180;

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

// Récupère les vidéos longues récentes d'une chaîne, jusqu'à `limit`.
// Retourne { ok: boolean, videos: [...] }. ok=false si YouTube a renvoyé une
// erreur ou si l'appel a planté. Utilisé pour ne pas purger sur erreur.
async function fetchRecentLongVideos(channelId, apiKey, limit = 10) {
  const playlistId = channelId.replace(/^UC/, 'UU');
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${apiKey}&playlistId=${playlistId}&part=contentDetails,snippet&maxResults=${Math.min(
    limit,
    50
  )}`;
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (e) {
    console.warn(`  ${channelId} : fetch failed (${e.message})`);
    return { ok: false, videos: [], latestPublishedAt: 0 };
  }
  if (data.error) {
    console.warn(`  ${channelId} : ${data.error.message}`);
    return { ok: false, videos: [], latestPublishedAt: 0 };
  }
  if (!data.items?.length) return { ok: true, videos: [], latestPublishedAt: 0 };

  const videoIds = data.items.map((v) => v.contentDetails.videoId).join(',');
  if (!videoIds) return { ok: true, videos: [], latestPublishedAt: 0 };

  let detData;
  try {
    const detRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&id=${videoIds}&part=contentDetails,snippet`
    );
    detData = await detRes.json();
  } catch (e) {
    console.warn(`  ${channelId} : details fetch failed (${e.message})`);
    return { ok: false, videos: [], latestPublishedAt: 0 };
  }
  if (detData.error) {
    console.warn(`  ${channelId} : details ${detData.error.message}`);
    return { ok: false, videos: [], latestPublishedAt: 0 };
  }

  // On parcourt les vidéos en gardant les longues. La plus récente
  // d'entre elles donne latestPublishedAt. Les shorts sont exclus, et
  // c'est voulu : ils polluent et ne sont pas du format Tubiscope.
  let latestPublishedAt = 0;
  const long = [];
  for (const it of data.items) {
    const det = detData.items?.find((d) => d.id === it.contentDetails.videoId);
    if (!det) continue;
    if (parseDuration(det.contentDetails.duration) < MIN_DURATION_S) continue;
    const pub = new Date(
      det.snippet?.publishedAt || it.snippet.publishedAt
    ).getTime();
    if (pub > latestPublishedAt) latestPublishedAt = pub;
    long.push({
      youtubeId: it.contentDetails.videoId,
      channelId,
      publishedAt: pub,
      title: det.snippet?.title || it.snippet.title || '',
      creatorName: det.snippet?.channelTitle || '',
    });
  }
  return { ok: true, videos: long, latestPublishedAt };
}

export default async function handler(req, res) {
  // Priorité : clé serveur Culture > clé serveur générique > clé front Culture > clé front générique.
  // Les deux premières ne sont pas exposées au navigateur.
  const YOUTUBE_API_KEY =
    process.env.YOUTUBE_API_KEY_CULTURE_SERVER ||
    process.env.YOUTUBE_API_KEY_SERVER ||
    process.env.VITE_YOUTUBE_API_KEY_CULTURE ||
    process.env.VITE_YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    return res?.status(500).json({
      success: false,
      error:
        'Aucune clé YouTube trouvée (YOUTUBE_API_KEY_CULTURE_SERVER, YOUTUBE_API_KEY_SERVER, VITE_YOUTUBE_API_KEY_CULTURE, VITE_YOUTUBE_API_KEY).',
    });
  }

  try {
    const db = initAdmin();

    // 1. Lire toutes les chaînes Culture et les grouper par categoryId
    const chSnap = await db
      .collection('channels')
      .where('mode', '==', 'culture')
      .get();

    if (chSnap.empty) {
      return res?.status(200).json({
        success: true,
        message: 'Aucune chaîne Culture en base.',
      });
    }

    const byTheme = {};
    chSnap.docs.forEach((d) => {
      const c = d.data();
      if (!c.categoryId || !c.channelId) return;
      (byTheme[c.categoryId] ||= []).push(c);
    });

    const report = {};
    let totalAdded = 0;
    let totalDeleted = 0;
    // Map channelId -> { lastVideoAt, videoCount } accumulé par catégorie
    const channelStats = {};

    for (const [themeId, channels] of Object.entries(byTheme)) {
      // 2. Fetch uploads de toutes les chaînes de la thématique
      const candidates = [];
      let failedChannels = 0;
      for (const ch of channels) {
        try {
          const { ok, videos: v, latestPublishedAt } = await fetchRecentLongVideos(
            ch.channelId,
            YOUTUBE_API_KEY,
            50
          );
          if (!ok) {
            failedChannels++;
            continue;
          }
          candidates.push(...v);
          // lastVideoAt = vraie dernière vidéo de la chaîne (shorts inclus),
          // pas seulement parmi les longues qui entrent dans les programs.
          if (latestPublishedAt > 0) {
            channelStats[ch.channelId] = channelStats[ch.channelId] || {
              lastVideoAt: 0,
              videoCount: 0,
            };
            if (latestPublishedAt > channelStats[ch.channelId].lastVideoAt) {
              channelStats[ch.channelId].lastVideoAt = latestPublishedAt;
            }
          }
        } catch (e) {
          failedChannels++;
          console.warn(`  Erreur fetch ${ch.channelId}: ${e.message}`);
        }
      }

      // 3. Tri par date, cap MAX_PER_CHANNEL par chaîne, puis on garde
      //    les CULTURE_VIDEOS_PER_THEME plus récentes du résultat.
      candidates.sort((a, b) => b.publishedAt - a.publishedAt);
      const seenPerChannel = new Map();
      const capped = [];
      for (const v of candidates) {
        const n = seenPerChannel.get(v.channelId) || 0;
        if (n >= MAX_PER_CHANNEL) continue;
        seenPerChannel.set(v.channelId, n + 1);
        capped.push(v);
      }
      const top = capped.slice(0, CULTURE_VIDEOS_PER_THEME);
      const topIds = new Set(top.map((v) => v.youtubeId));

      // 4. Lire l'existant
      const existingSnap = await db
        .collection('scopes')
        .doc(themeId)
        .collection('programs')
        .get();
      const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const existingIds = new Set(existing.map((p) => p.youtubeId));

      // GARDE-FOU : si plus de la moitié des chaînes du thème ont planté,
      // on n'effectue aucune suppression. C'est le signe d'un problème
      // global (clé restreinte, quota grillé, panne YouTube...) plutôt
      // que de vraies disparitions de vidéos.
      const failureRatio = channels.length > 0 ? failedChannels / channels.length : 1;
      const safeMode = failureRatio > 0.5;

      // 5. Delta
      const toAdd = top.filter((v) => !existingIds.has(v.youtubeId));
      const toDelete = safeMode
        ? []
        : existing.filter((p) => !topIds.has(p.youtubeId));

      if (safeMode) {
        console.warn(
          `  ${themeId} : SAFE MODE (${failedChannels}/${channels.length} chaînes en erreur), aucune suppression.`
        );
      }

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
            addedBy: 'sync-culture',
            pitch: '',
            createdAt: Date.now(),
            publishedAt: v.publishedAt,
            avgScore: 0,
            title: v.title || '',
            creatorName: v.creatorName || '',
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

      // 6. videoCount par chaîne pour cette catégorie : compter dans top
      for (const ch of channels) {
        const cnt = top.filter((v) => v.channelId === ch.channelId).length;
        channelStats[ch.channelId] = channelStats[ch.channelId] || {
          lastVideoAt: ch.lastVideoAt || 0,
          videoCount: 0,
        };
        channelStats[ch.channelId].videoCount = cnt;
      }

      report[themeId] = { added, deleted, channels: channels.length };
      totalAdded += added;
      totalDeleted += deleted;
      console.log(
        `  ${themeId} : +${added} / -${deleted} sur ${channels.length} chaînes`
      );
    }

    // 7. Mise à jour /channels avec lastVideoAt + videoCount
    const now = Date.now();
    const ids = Object.keys(channelStats);
    for (let i = 0; i < ids.length; i += 400) {
      const batch = db.batch();
      for (const cid of ids.slice(i, i + 400)) {
        const s = channelStats[cid];
        batch.set(
          db.collection('channels').doc(cid),
          {
            lastVideoAt: s.lastVideoAt,
            videoCount: s.videoCount,
            lastCheckedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }
      await batch.commit();
    }

    const payload = {
      success: true,
      message: `Synchronisation Culture terminée. ${totalAdded} nouveautés, ${totalDeleted} anciennes supprimées sur ${Object.keys(byTheme).length} catégories.`,
      totalAdded,
      totalDeleted,
      report,
    };

    if (res?.status) return res.status(200).json(payload);
    return payload;
  } catch (error) {
    console.error('Erreur sync-culture :', error);
    if (res?.status) return res.status(500).json({ success: false, error: error.message });
    throw error;
  }
}
