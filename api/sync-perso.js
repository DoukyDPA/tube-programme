// =====================================================================
// api/sync-perso.js
// =====================================================================
// Synchronise les vidéos des chaînes des thèmes PERSO vers Firestore.
//
// Source de vérité : les sous-collections users/{uid}/themes/{themeId}/programs.
// Un thème perso n'a pas de registre /channels parallèle (contrairement aux
// scopes éditeur et Culture). Les chaînes d'un thème sont donc simplement
// l'ensemble des channelId déjà présents dans ses programs. C'est la même
// logique que l'AdminPanel, qui dérive les chaînes depuis les programs.
//
// Pour chaque thème et chaque chaîne qu'il contient :
//   - on fetch via YouTube les TOP_N dernières vidéos longues (>= 180s)
//   - on écrit le delta dans users/{uid}/themes/{themeId}/programs
//     (ajout des nouvelles, suppression de celles sorties du top N)
//
// OPTIMISATION : chaque chaîne YouTube n'est interrogée qu'UNE fois par run,
// même si plusieurs users ou plusieurs thèmes suivent la même. Un cache
// channelId -> résultat est rempli en amont, puis réutilisé pour tous les
// deltas. C'est ce qui rend la synchro tenable quand la version payante
// multipliera les thèmes perso.
//
// Auth : firebase-admin via service account (bypass rules).
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIN_DURATION_S = 180;
const TOP_N = 5;

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


// Vrai si la vidéo est regardable depuis la France. YouTube renvoie
// contentDetails.regionRestriction avec soit `blocked` (liste noire),
// soit `allowed` (liste blanche). France TV bloque parfois ses vidéos
// en France (droits réservés à france.tv) : inutile de les afficher.
const playableInFrance = (det) => {
  const rr = det?.contentDetails?.regionRestriction;
  if (!rr) return true;
  if (rr.blocked?.includes('FR')) return false;
  if (rr.allowed && !rr.allowed.includes('FR')) return false;
  return true;
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

// Récupère les TOP_N dernières vidéos longues d'une chaîne.
// Copie fidèle de la logique de sync.js : mêmes garde-fous, même filtre
// shorts. ok=false si YouTube plante, et dans ce cas on ne purge rien.
async function fetchTopVideos(channelId, apiKey) {
  const playlistId = channelId.replace(/^UC/, 'UU');
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${apiKey}&playlistId=${playlistId}&part=contentDetails,snippet&maxResults=50`;
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
  let detData;
  try {
    const detRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&id=${videoIds}&part=contentDetails,snippet,status`
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

  let latestPublishedAt = 0;
  const out = [];
  for (const it of data.items) {
    const det = detData.items?.find((d) => d.id === it.contentDetails.videoId);
    if (!det) continue;
    if (parseDuration(det.contentDetails.duration) < MIN_DURATION_S) continue;
    if (!playableInFrance(det)) continue;
    const pub = new Date(
      det.snippet?.publishedAt || it.snippet.publishedAt
    ).getTime();
    if (pub > latestPublishedAt) latestPublishedAt = pub;
    if (out.length < TOP_N) {
      out.push({
        youtubeId: it.contentDetails.videoId,
        title: det.snippet?.title || '',
        creatorName: det.snippet?.channelTitle || '',
        publishedAt: pub,
        // false si l'ayant droit interdit la lecture hors youtube.com
        embeddable: det.status?.embeddable !== false,
      });
    }
  }
  return { ok: true, videos: out, latestPublishedAt };
}

export default async function handler(req, res) {
  const YOUTUBE_API_KEY =
    process.env.YOUTUBE_API_KEY_SERVER || process.env.VITE_YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    return res?.status(500).json({
      success: false,
      error: 'YOUTUBE_API_KEY_SERVER ou VITE_YOUTUBE_API_KEY manquante',
    });
  }

  try {
    const db = initAdmin();

    // 1. Parcourir users -> themes -> programs et bâtir la liste des thèmes.
    //    On lit aussi le watch later de chaque user pour protéger ses vidéos.
    //    Portée volontairement limitée aux perso : on ne touche jamais
    //    scopes/ (éditeur + Culture), qui ont leurs propres synchros.
    const usersSnap = await db.collection('users').get();

    const themes = []; // { uid, themeId, ref, programs:[], channelIds:Set, protectedIds:Set }
    const channelIds = new Set(); // union globale, pour la dédup du fetch

    for (const u of usersSnap.docs) {
      const uid = u.id;

      // Watch later perso : simple tableau de youtubeId (pas d'horodatage,
      // cf. App.jsx). On protège tout ce que l'user a mis de côté, dans la
      // limite des 10 autorisés. Périmètre : ce user uniquement.
      const wl = u.data().watchLater;
      const protectedIds = new Set(Array.isArray(wl) ? wl : []);

      const themesSnap = await u.ref.collection('themes').get();
      for (const t of themesSnap.docs) {
        const progSnap = await t.ref.collection('programs').get();
        if (progSnap.empty) continue;

        const programs = progSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const themeChannelIds = new Set();
        for (const p of programs) {
          if (p.channelId) {
            themeChannelIds.add(p.channelId);
            channelIds.add(p.channelId);
          }
        }
        if (themeChannelIds.size === 0) continue;

        themes.push({
          uid,
          themeId: t.id,
          ref: t.ref,
          programs,
          channelIds: themeChannelIds,
          protectedIds,
        });
      }
    }

    if (themes.length === 0) {
      const payload = {
        success: true,
        message: 'Aucun thème perso avec des chaînes à synchroniser.',
        totalAdded: 0,
        totalDeleted: 0,
      };
      if (res?.status) return res.status(200).json(payload);
      return payload;
    }

    // 2. Fetch dédupliqué : chaque chaîne interrogée une seule fois.
    const cache = new Map(); // channelId -> { ok, videos, latestPublishedAt }
    for (const cid of channelIds) {
      cache.set(cid, await fetchTopVideos(cid, YOUTUBE_API_KEY));
    }
    console.log(
      `sync-perso : ${channelIds.size} chaîne(s) unique(s) interrogée(s) pour ${themes.length} thème(s).`
    );

    // 3. Appliquer le delta par thème, par chaîne.
    let addedCount = 0;
    let deletedCount = 0;
    let skippedChannels = 0;
    const themeReport = [];

    for (const theme of themes) {
      const colRef = theme.ref.collection('programs');

      // Index des programs existants du thème par chaîne.
      const existingByChannel = new Map();
      for (const p of theme.programs) {
        if (!p.channelId) continue;
        if (!existingByChannel.has(p.channelId)) existingByChannel.set(p.channelId, []);
        existingByChannel.get(p.channelId).push(p);
      }

      let added = 0;
      let deleted = 0;

      for (const cid of theme.channelIds) {
        const fetched = cache.get(cid);

        // GARDE-FOU : fetch YouTube en erreur -> on ne touche pas cette
        // chaîne dans ce thème. Pas de fetch raté = purge accidentelle.
        if (!fetched || !fetched.ok) {
          skippedChannels++;
          continue;
        }

        const top = fetched.videos;
        const topIds = new Set(top.map((v) => v.youtubeId));
        const existing = existingByChannel.get(cid) || [];
        const existingIds = new Set(existing.map((p) => p.youtubeId));

        const toAdd = top.filter((v) => !existingIds.has(v.youtubeId));
        const toDelete = existing.filter(
          (p) => !topIds.has(p.youtubeId) && !theme.protectedIds.has(p.youtubeId)
        );

        for (let i = 0; i < toAdd.length; i += 400) {
          const batch = db.batch();
          for (const v of toAdd.slice(i, i + 400)) {
            const ref = colRef.doc();
            batch.set(ref, {
              youtubeId: v.youtubeId,
              channelId: cid,
              categoryId: theme.themeId,
              addedBy: theme.uid,
              pitch: '',
              createdAt: Date.now(),
              publishedAt: v.publishedAt,
              avgScore: 0,
              title: v.title,
              creatorName: v.creatorName,
              embeddable: v.embeddable !== false,
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
      }

      addedCount += added;
      deletedCount += deleted;
      themeReport.push({
        uid: theme.uid,
        themeId: theme.themeId,
        channels: theme.channelIds.size,
        added,
        deleted,
      });
      console.log(
        `  ${theme.uid}/${theme.themeId} (${theme.channelIds.size} chaîne(s)) : +${added} / -${deleted}`
      );
    }

    const payload = {
      success: true,
      message: `Synchronisation perso terminée. ${addedCount} nouveautés, ${deletedCount} anciennes supprimées, ${skippedChannels} chaînes ignorées (erreur YouTube) sur ${themes.length} thèmes et ${channelIds.size} chaînes uniques.`,
      totalAdded: addedCount,
      totalDeleted: deletedCount,
      totalSkipped: skippedChannels,
      uniqueChannels: channelIds.size,
      themes: themeReport,
    };

    const trigger = req && typeof req.get === 'function' ? 'api' : 'cron';
    await db.collection('auditLogs').add({
      action: 'sync_perso',
      performedBy: trigger,
      performedAt: FieldValue.serverTimestamp(),
      meta: {
        totalAdded: addedCount,
        totalDeleted: deletedCount,
        totalSkipped: skippedChannels,
        themes: themes.length,
        uniqueChannels: channelIds.size,
      },
    });

    if (res?.status) return res.status(200).json(payload);
    return payload;
  } catch (error) {
    console.error('Erreur sync-perso :', error);
    if (res?.status) return res.status(500).json({ success: false, error: error.message });
    throw error;
  }
}
