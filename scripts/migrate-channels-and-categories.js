// =====================================================================
// scripts/migrate-channels-and-categories.js
// =====================================================================
// Crée et alimente deux nouvelles collections Firestore :
//
//   /channels/{channelId}
//     {
//       channelId:    string  (UC...)
//       handle:       string | null  ('@xxx' sans @, optionnel)
//       name:         string  (nom d'affichage)
//       categoryId:   string  (id de la catégorie associée)
//       mode:         'tubiscope' | 'culture'
//       lastVideoAt:  number  (timestamp ms de la dernière vidéo longue)
//       lastCheckedAt: number (timestamp ms du dernier appel YouTube)
//       videoCount:   number  (programmes actifs côté Firestore)
//       createdAt:    number
//       updatedAt:    number
//     }
//
//   /categories/{categoryId}
//     {
//       id:        string
//       label:     string
//       mode:      'tubiscope' | 'culture'
//       icon:      string | null
//       order:     number
//       createdAt: number
//       updatedAt: number
//     }
//
// Source de vérité initiale :
//   - Catégories Tubiscope : CATEGORIES hardcodées dans AdminPanel.jsx (5)
//   - Catégories Culture   : CULTURE_THEMES depuis src/data/cultureChannels.js (19)
//   - Chaînes Tubiscope    : channelId distincts trouvés dans scopes/{scopeId}/programs
//   - Chaînes Culture      : culture-channels-resolved.json (ou résolus à la volée)
//
// Le script est idempotent : si une chaîne ou une catégorie existe déjà,
// on garde son lastVideoAt et son order, on met juste à jour name/categoryId
// si nécessaire.
//
// Usage :
//   node scripts/migrate-channels-and-categories.js [--skip-youtube]
//
// L'option --skip-youtube ignore les appels YouTube pour lastVideoAt (utile
// pour tester sans consommer de quota).
//
// Variables d'env requises :
//   VITE_YOUTUBE_API_KEY ou VITE_YOUTUBE_API_KEY_CULTURE
// =====================================================================

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

import {
  CULTURE_THEMES,
  CULTURE_CHANNELS,
} from '../src/data/cultureChannels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env') });

const SKIP_YOUTUBE = process.argv.includes('--skip-youtube');

// Script Node : on prend la clé serveur en priorité (pas de restriction Referer).
const YOUTUBE_API_KEY =
  process.env.YOUTUBE_API_KEY_CULTURE_SERVER ||
  process.env.YOUTUBE_API_KEY_SERVER ||
  process.env.VITE_YOUTUBE_API_KEY_CULTURE ||
  process.env.VITE_YOUTUBE_API_KEY;

if (!YOUTUBE_API_KEY && !SKIP_YOUTUBE) {
  console.error('VITE_YOUTUBE_API_KEY absent. Utilise --skip-youtube pour tester.');
  process.exit(1);
}

// Catégories Tubiscope (cohérent avec AdminPanel.jsx)
const TUBISCOPE_CATEGORIES = [
  { id: 'divertissement', label: 'Divertissement Scope', icon: 'sparkles', order: 1 },
  { id: 'ia',             label: 'IA & Tech Scope',      icon: 'cpu',      order: 2 },
  { id: 'lecture',        label: 'Culture Scope',        icon: 'book',     order: 3 },
  { id: 'foot',           label: 'Economie Scope',       icon: 'trophy',   order: 4 },
  { id: 'interviews',     label: 'Talks Scope',          icon: 'mic',      order: 5 },
];

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-admin-key.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// Résout un handle YouTube en channelId UC...
async function resolveHandle(handle) {
  const url = `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=@${encodeURIComponent(handle)}&part=id,snippet`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.items?.length > 0) {
      return {
        channelId: data.items[0].id,
        title: data.items[0].snippet?.title || handle,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Récupère le timestamp ms de la dernière vidéo longue (>= 180s) d'une chaîne
async function fetchLastVideoAt(channelId) {
  const playlistId = channelId.replace(/^UC/, 'UU');
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY}&playlistId=${playlistId}&part=contentDetails,snippet&maxResults=15`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items?.length) return 0;

    const videoIds = data.items.map((v) => v.contentDetails.videoId).join(',');
    const detRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails,snippet`
    );
    const detData = await detRes.json();

    for (const it of data.items) {
      const det = detData.items?.find((d) => d.id === it.contentDetails.videoId);
      if (!det) continue;
      if (parseDuration(det.contentDetails.duration) < 180) continue;
      return new Date(det.snippet?.publishedAt || it.snippet.publishedAt).getTime();
    }
    return 0;
  } catch (e) {
    console.warn(`  Erreur fetch last video pour ${channelId}: ${e.message}`);
    return 0;
  }
}

// ----- 1. Migration des catégories -----
async function migrateCategories() {
  console.log('\n=== Catégories ===');
  const batch = db.batch();
  const now = Date.now();
  let created = 0;
  let updated = 0;

  for (const cat of TUBISCOPE_CATEGORIES) {
    const ref = db.collection('categories').doc(cat.id);
    const snap = await ref.get();
    const payload = {
      id: cat.id,
      label: cat.label,
      mode: 'tubiscope',
      icon: cat.icon,
      order: cat.order,
      updatedAt: now,
    };
    if (!snap.exists) {
      payload.createdAt = now;
      created++;
    } else {
      updated++;
    }
    batch.set(ref, payload, { merge: true });
  }

  for (let i = 0; i < CULTURE_THEMES.length; i++) {
    const theme = CULTURE_THEMES[i];
    const ref = db.collection('categories').doc(theme.id);
    const snap = await ref.get();
    const payload = {
      id: theme.id,
      label: theme.label,
      mode: 'culture',
      icon: 'book',
      order: i + 1,
      updatedAt: now,
    };
    if (!snap.exists) {
      payload.createdAt = now;
      created++;
    } else {
      updated++;
    }
    batch.set(ref, payload, { merge: true });
  }

  await batch.commit();
  console.log(`  ${created} créées, ${updated} mises à jour.`);
}

// ----- 2. Migration des chaînes Tubiscope (depuis les programs existants) -----
async function migrateTubiscopeChannels() {
  console.log('\n=== Chaînes Tubiscope ===');
  const scopeIds = TUBISCOPE_CATEGORIES.map((c) => c.id);
  const byChannel = new Map(); // channelId -> { categoryId, name, count }

  for (const scopeId of scopeIds) {
    const snap = await db.collection('scopes').doc(scopeId).collection('programs').get();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (!data.channelId) return;
      const existing = byChannel.get(data.channelId);
      if (!existing) {
        byChannel.set(data.channelId, {
          categoryId: scopeId,
          name: data.creatorName || data.channelId,
          count: 1,
        });
      } else {
        existing.count += 1;
        if (!existing.name || existing.name === data.channelId) {
          existing.name = data.creatorName || existing.name;
        }
      }
    });
    console.log(`  scope ${scopeId} : ${snap.size} programs scannés`);
  }

  let created = 0;
  let updated = 0;
  const all = Array.from(byChannel.entries());
  console.log(`  ${all.length} chaînes uniques détectées.`);

  for (const [channelId, info] of all) {
    const ref = db.collection('channels').doc(channelId);
    const snap = await ref.get();
    const now = Date.now();

    let lastVideoAt = snap.exists ? snap.data().lastVideoAt || 0 : 0;
    if (!SKIP_YOUTUBE && lastVideoAt === 0) {
      lastVideoAt = await fetchLastVideoAt(channelId);
      await sleep(60);
    }

    const payload = {
      channelId,
      handle: snap.exists ? snap.data().handle || null : null,
      name: info.name,
      categoryId: info.categoryId,
      mode: 'tubiscope',
      lastVideoAt,
      lastCheckedAt: SKIP_YOUTUBE ? (snap.exists ? snap.data().lastCheckedAt || 0 : 0) : now,
      videoCount: info.count,
      updatedAt: now,
    };
    if (!snap.exists) {
      payload.createdAt = now;
      created++;
    } else {
      updated++;
    }
    await ref.set(payload, { merge: true });
    process.stdout.write('.');
  }
  console.log(`\n  ${created} créées, ${updated} mises à jour.`);
}

// ----- 3. Migration des chaînes Culture -----
async function migrateCultureChannels() {
  console.log('\n=== Chaînes Culture ===');

  // Charge resolved si possible
  const resolvedPath = join(__dirname, 'culture-channels-resolved.json');
  let resolved = {};
  if (existsSync(resolvedPath)) {
    try {
      const txt = readFileSync(resolvedPath, 'utf8');
      if (txt.trim()) resolved = JSON.parse(txt);
    } catch (e) {
      console.warn(`  resolved JSON illisible: ${e.message}`);
    }
  }
  const resolvedCount = Object.keys(resolved).length;
  console.log(`  ${resolvedCount} handles déjà résolus en cache.`);

  let created = 0;
  let updated = 0;
  let resolvedNew = 0;
  let totalChannels = 0;

  // On itère sur CULTURE_CHANNELS (source de vérité initiale)
  for (const theme of CULTURE_THEMES) {
    const channels = CULTURE_CHANNELS[theme.id] || [];
    console.log(`  ${theme.id} (${channels.length} chaînes)`);

    for (const ch of channels) {
      totalChannels++;
      let entry = resolved[ch.handle];

      if (!entry?.channelId && !SKIP_YOUTUBE) {
        const r = await resolveHandle(ch.handle);
        await sleep(60);
        if (r) {
          entry = {
            channelId: r.channelId,
            themeId: theme.id,
            name: ch.name,
            ytTitle: r.title,
          };
          resolved[ch.handle] = entry;
          resolvedNew++;
        }
      }

      if (!entry?.channelId) {
        console.warn(`    ! ${ch.handle} non résolu, skip`);
        continue;
      }

      const ref = db.collection('channels').doc(entry.channelId);
      const snap = await ref.get();
      const now = Date.now();

      let lastVideoAt = snap.exists ? snap.data().lastVideoAt || 0 : 0;
      if (!SKIP_YOUTUBE && lastVideoAt === 0) {
        lastVideoAt = await fetchLastVideoAt(entry.channelId);
        await sleep(60);
      }

      // videoCount Culture : on compte les programs dans scopes/{themeId}/programs
      // qui ont ce channelId
      let videoCount = 0;
      try {
        const programsSnap = await db
          .collection('scopes')
          .doc(theme.id)
          .collection('programs')
          .where('channelId', '==', entry.channelId)
          .get();
        videoCount = programsSnap.size;
      } catch (e) {
        // pas grave si l'index manque, on laissera 0
      }

      const payload = {
        channelId: entry.channelId,
        handle: ch.handle,
        name: ch.name,
        categoryId: theme.id,
        mode: 'culture',
        lastVideoAt,
        lastCheckedAt: SKIP_YOUTUBE ? (snap.exists ? snap.data().lastCheckedAt || 0 : 0) : now,
        videoCount,
        updatedAt: now,
      };
      if (!snap.exists) {
        payload.createdAt = now;
        created++;
      } else {
        updated++;
      }
      await ref.set(payload, { merge: true });
    }
  }

  // Persiste le cache resolved enrichi
  if (resolvedNew > 0) {
    writeFileSync(resolvedPath, JSON.stringify(resolved, null, 2));
    writeFileSync(
      join(__dirname, '..', 'public', 'culture-channels-resolved.json'),
      JSON.stringify(resolved, null, 2)
    );
    console.log(`  ${resolvedNew} handles nouvellement résolus écrits dans le cache.`);
  }

  console.log(`  Total ${totalChannels} chaînes traitées : ${created} créées, ${updated} mises à jour.`);
}

// ----- Run -----
(async () => {
  console.log('====================================================');
  console.log('  Migration channels + categories');
  console.log(`  SKIP_YOUTUBE = ${SKIP_YOUTUBE}`);
  console.log('====================================================');

  try {
    await migrateCategories();
    await migrateTubiscopeChannels();
    await migrateCultureChannels();
    console.log('\nMigration terminée.');
    process.exit(0);
  } catch (e) {
    console.error('\nErreur migration :', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
