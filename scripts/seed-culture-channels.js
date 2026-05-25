// =====================================================================
// scripts/seed-culture-channels.js
// =====================================================================
// Pour chaque chaîne définie dans src/data/cultureChannels.js, résout son
// handle (@xxx) en channelId YouTube (UC...) via l'API YouTube Data v3.
//
// Produit deux fichiers :
//   1. scripts/culture-channels-resolved.json
//      Mapping handle → { channelId, themeId, name } pour toutes les
//      chaînes résolues. Utilisé par api/sync.js et par le seed Firestore.
//   2. scripts/culture-channels-unresolved.json
//      Liste des handles qui n'ont PAS pu être résolus (typo probable).
//      À corriger manuellement dans cultureChannels.js puis relancer.
//
// Usage :
//   node scripts/seed-culture-channels.js
//
// Variables d'env requises (lit .env via dotenv) :
//   VITE_YOUTUBE_API_KEY  Clé API YouTube Data v3
//
// Coût en quota YouTube :
//   1 unité par appel channels.list, soit ~363 unités pour le set complet.
//   Largement sous le quota quotidien de 10 000 unités.
// =====================================================================

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

import { CULTURE_THEMES, CULTURE_CHANNELS } from '../src/data/cultureChannels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charge .env à la racine du projet
config({ path: join(__dirname, '..', '.env') });

const YOUTUBE_API_KEY =
  process.env.VITE_YOUTUBE_API_KEY_CULTURE || process.env.VITE_YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) {
  console.error(
    '❌ VITE_YOUTUBE_API_KEY_CULTURE (ou VITE_YOUTUBE_API_KEY) absente dans .env'
  );
  process.exit(1);
}

// Cache : on ne re-résout pas un handle déjà connu
const cachePath = join(__dirname, 'culture-channels-resolved.json');
let cache = {};
try {
  cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  console.log(`📦 Cache : ${Object.keys(cache).length} handles déjà résolus.\n`);
} catch {
  console.log('📦 Cache vide, on part de zéro.\n');
}

const resolved = { ...cache };
const unresolved = [];

const resolveHandle = async (handle) => {
  // Tente d'abord forHandle (recommandé YouTube 2023+)
  const url = `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=@${encodeURIComponent(handle)}&part=id,snippet`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.error(`  ⚠️  Erreur API pour @${handle} : ${data.error.message}`);
      return null;
    }
    if (data.items && data.items.length > 0) {
      return {
        channelId: data.items[0].id,
        title: data.items[0].snippet?.title || handle,
      };
    }
    // Fallback : recherche par username (rarement utile aujourd'hui)
    const url2 = `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forUsername=${encodeURIComponent(handle)}&part=id,snippet`;
    const res2 = await fetch(url2);
    const data2 = await res2.json();
    if (data2.items && data2.items.length > 0) {
      return {
        channelId: data2.items[0].id,
        title: data2.items[0].snippet?.title || handle,
      };
    }
    return null;
  } catch (e) {
    console.error(`  💥 Exception réseau pour @${handle} : ${e.message}`);
    return null;
  }
};

// Petit utilitaire pour ne pas spammer l'API
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let totalChannels = 0;
let newlyResolved = 0;
let alreadyResolved = 0;

for (const theme of CULTURE_THEMES) {
  const channels = CULTURE_CHANNELS[theme.id] || [];
  console.log(`\n=== ${theme.label} (${theme.id}) : ${channels.length} chaînes ===`);

  for (const ch of channels) {
    totalChannels++;
    const cached = resolved[ch.handle];
    if (cached && cached.channelId) {
      alreadyResolved++;
      // On met à jour le themeId au cas où la chaîne ait changé de catégorie
      cached.themeId = theme.id;
      cached.name = ch.name;
      continue;
    }

    process.stdout.write(`  @${ch.handle} ... `);
    const r = await resolveHandle(ch.handle);
    if (r) {
      resolved[ch.handle] = {
        channelId: r.channelId,
        themeId: theme.id,
        name: ch.name,
        ytTitle: r.title,
      };
      newlyResolved++;
      console.log(`✅ ${r.channelId}`);
    } else {
      unresolved.push({ handle: ch.handle, name: ch.name, themeId: theme.id });
      console.log('❌ introuvable');
    }
    // Petite pause pour rester poli avec l'API
    await sleep(60);
  }
}

writeFileSync(cachePath, JSON.stringify(resolved, null, 2));
// Copie publique pour le front (servie via /culture-channels-resolved.json)
writeFileSync(
  join(__dirname, '..', 'public', 'culture-channels-resolved.json'),
  JSON.stringify(resolved, null, 2)
);
writeFileSync(
  join(__dirname, 'culture-channels-unresolved.json'),
  JSON.stringify(unresolved, null, 2)
);

console.log('\n====================================================');
console.log(`  Total chaînes        : ${totalChannels}`);
console.log(`  Déjà résolues (cache): ${alreadyResolved}`);
console.log(`  Nouvellement résolues: ${newlyResolved}`);
console.log(`  Non résolues         : ${unresolved.length}`);
console.log('====================================================');
console.log(`  📂 ${cachePath}`);
if (unresolved.length > 0) {
  console.log(`  ⚠️  ${unresolved.length} handles à corriger dans culture-channels-unresolved.json`);
}
