// =====================================================================
// api/sync.js
// =====================================================================
// Synchronise les vidéos des chaînes Tubiscope (scopes éditeur) vers
// Firestore.
//
// Source de vérité : collection /channels (mode = 'tubiscope').
// Pour chaque chaîne :
//   - on fetch via YouTube API les 5 dernières vidéos longues (>= 180s)
//   - on écrit le delta dans scopes/{channel.categoryId}/programs
//     (ajout des nouvelles, suppression de celles qui ne sont plus
//     dans le top 5)
//   - on met à jour lastVideoAt, lastCheckedAt et videoCount dans
//     /channels/{channelId}
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

const MIN_DURATION_S = 180;
const TOP_N = 5;

// Récupère les TOP_N dernières vidéos longues d'une chaîne avec leurs métadonnées.
// Retourne { ok: boolean, videos: [...] }. ok=false si YouTube a renvoyé une
// erreur ou si l'appel a planté : dans ce cas, ne JAMAIS purger l'existant.
async function fetchTopVideos(channelId, apiKey) {
  const playlistId = channelId.replace(/^UC/, 'UU');
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${apiKey}&playlistId=${playlistId}&part=contentDetails,snippet&maxResults=15`;
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (e) {
    console.warn(`  ${channelId} : fetch failed (${e.message})`);
    return { ok: false, videos: [] };
  }
  if (data.error) {
    console.warn(`  ${channelId} : ${data.error.message}`);
    return { ok: false, videos: [] };
  }
  // Pas d'erreur, mais playlist vide : c'est un état légitime (chaîne sans vidéos).
  if (!data.items?.length) return { ok: true, videos: [] };

  const videoIds = data.items.map((v) => v.contentDetails.videoId).join(',');
  let detData;
  try {
    const detRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&id=${videoIds}&part=contentDetails,snippet`
    );
    detData = await detRes.json();
  } catch (e) {
    console.warn(`  ${channelId} : details fetch failed (${e.message})`);
    return { ok: false, videos: [] };
  }
  if (detData.error) {
    console.warn(`  ${channelId} : details ${detData.error.message}`);
    return { ok: false, videos: [] };
  }

  const out = [];
  for (const it of data.items) {
    const det = detData.items?.find((d) => d.id === it.contentDetails.videoId);
    if (!det) continue;
    if (parseDuration(det.contentDetails.duration) < MIN_DURATION_S) continue;
    out.push({
      youtubeId: it.contentDetails.videoId,
      title: det.snippet?.title || '',
      creatorName: det.snippet?.channelTitle || '',
      publishedAt: new Date(
        det.snippet?.publishedAt || it.snippet.publishedAt
      ).getTime(),
    });
    if (out.length === TOP_N) break;
  }
  return { ok: true, videos: out };
}

export default async function handler(req, res) {
  // On préfère la clé serveur si elle existe, sinon on retombe sur
  // VITE_YOUTUBE_API_KEY pour rester compatible avec l'ancien .env.
  const YOUTUBE_API_KEY =
    process.env.YOUTUBE_API_KEY_SERVER || process.env.VITE_YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    return res
      ?.status(500)
      .json({
        success: false,
        error: 'YOUTUBE_API_KEY_SERVER ou VITE_YOUTUBE_API_KEY manquante',
      });
  }

  try {
    const db = initAdmin();

    // 1. Lire toutes les chaînes Tubiscope depuis /channels
    const channelsSnap = await db
      .collection('channels')
      .where('mode', '==', 'tubiscope')
      .get();

    if (channelsSnap.empty) {
      return res?.status(200).json({
        success: true,
        message: 'Aucune chaîne Tubiscope en base.',
      });
    }

    let addedCount = 0;
    let deletedCount = 0;
    let skippedCount = 0;
    const channelReport = [];

    for (const chDoc of channelsSnap.docs) {
      const ch = chDoc.data();
      const channelId = ch.channelId || chDoc.id;
      const categoryId = ch.categoryId;
      if (!categoryId) {
        console.warn(`  ${channelId} : pas de categoryId, skip`);
        continue;
      }

      // 2. Fetch top N vidéos depuis YouTube
      const { ok, videos: top } = await fetchTopVideos(
        channelId,
        YOUTUBE_API_KEY
      );

      // GARDE-FOU CRITIQUE : si YouTube a échoué (clé restreinte, quota,
      // panne réseau...), on n'ajoute rien et on ne supprime rien. Sinon
      // un fetch raté = suppression totale des programs de la chaîne.
      if (!ok) {
        skippedCount++;
        channelReport.push({
          channelId,
          name: ch.name,
          added: 0,
          deleted: 0,
          skipped: true,
        });
        console.log(
          `  ${ch.name || channelId} : SKIP (fetch YouTube en erreur)`
        );
        continue;
      }

      const topIds = new Set(top.map((v) => v.youtubeId));

      // 3. Lire les programs existants pour cette chaîne dans la bonne catégorie
      const existingSnap = await db
        .collection('scopes')
        .doc(categoryId)
        .collection('programs')
        .where('channelId', '==', channelId)
        .get();

      const existing = existingSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      const existingIds = new Set(existing.map((p) => p.youtubeId));

      // 4. Delta : ajouts et suppressions
      const toAdd = top.filter((v) => !existingIds.has(v.youtubeId));
      const toDelete = existing.filter((p) => !topIds.has(p.youtubeId));

      const colRef = db.collection('scopes').doc(categoryId).collection('programs');

      // 5. Writes batchés
      let added = 0;
      let deleted = 0;
      for (let i = 0; i < toAdd.length; i += 400) {
        const batch = db.batch();
        for (const v of toAdd.slice(i, i + 400)) {
          const ref = colRef.doc();
          batch.set(ref, {
            youtubeId: v.youtubeId,
            channelId,
            categoryId,
            addedBy: ch.addedBy || 'sync-tubiscope',
            pitch: '',
            createdAt: Date.now(),
            publishedAt: v.publishedAt,
            avgScore: 0,
            title: v.title,
            creatorName: v.creatorName,
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

      // 6. Mettre à jour /channels avec lastVideoAt et videoCount
      const newCount = existing.length - toDelete.length + toAdd.length;
      const lastVideoAt = top[0]?.publishedAt || ch.lastVideoAt || 0;
      await db.collection('channels').doc(channelId).set(
        {
          lastVideoAt,
          lastCheckedAt: Date.now(),
          videoCount: newCount,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      addedCount += added;
      deletedCount += deleted;
      channelReport.push({ channelId, name: ch.name, added, deleted });
      console.log(
        `  ${ch.name || channelId} (${categoryId}) : +${added} / -${deleted}`
      );
    }

    const payload = {
      success: true,
      message: `Synchronisation Tubiscope terminée. ${addedCount} nouveautés, ${deletedCount} anciennes supprimées, ${skippedCount} chaînes ignorées (erreur YouTube) sur ${channelsSnap.size} chaînes.`,
      totalAdded: addedCount,
      totalDeleted: deletedCount,
      totalSkipped: skippedCount,
      channels: channelReport,
    };

    if (res?.status) return res.status(200).json(payload);
    return payload;
  } catch (error) {
    console.error('Erreur sync :', error);
    if (res?.status) return res.status(500).json({ success: false, error: error.message });
    throw error;
  }
}
