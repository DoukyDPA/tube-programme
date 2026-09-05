// =====================================================================
// scripts/cleanup-geoblocked.js
// =====================================================================
// Passe unique sur tous les programmes existants (scopes/*/programs) :
//
//   1. Interroge l'API YouTube par lots de 50 (videos?part=contentDetails,status).
//   2. Supprime les programmes bloqués en France (regionRestriction),
//      cas France TV dont les droits sont réservés à france.tv.
//   3. Renseigne le champ `embeddable` sur les autres, pour que
//      VideoModal bascule sur « Regarder sur YouTube » si besoin.
//   4. Supprime aussi les programmes dont la vidéo n'existe plus
//      (absente de la réponse API : privée ou supprimée).
//
// Aligné sur playableInFrance() de api/sync*.js. Les syncs font
// déjà ce filtrage pour les nouveautés ; ce script rattrape le stock.
//
// Sans argument : DRY RUN. Avec --apply : exécute.
//
// Usage :
//   node scripts/cleanup-geoblocked.js            # dry run
//   node scripts/cleanup-geoblocked.js --apply
//
// Clé API : YOUTUBE_API_KEY_SERVER ou VITE_YOUTUBE_API_KEY (.env).
// Coût : 1 unité de quota par lot de 50 vidéos.
// =====================================================================

import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-admin-key.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');
const API_KEY =
  process.env.YOUTUBE_API_KEY_SERVER || process.env.VITE_YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('Clé YouTube manquante (YOUTUBE_API_KEY_SERVER ou VITE_YOUTUBE_API_KEY).');
  process.exit(1);
}

const playableInFrance = (det) => {
  const rr = det?.contentDetails?.regionRestriction;
  if (!rr) return true;
  if (rr.blocked?.includes('FR')) return false;
  if (rr.allowed && !rr.allowed.includes('FR')) return false;
  return true;
};

async function fetchDetails(ids) {
  const url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${ids.join(',')}&part=contentDetails,status`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const map = new Map();
  for (const it of data.items || []) map.set(it.id, it);
  return map;
}

async function main() {
  console.log(APPLY ? '=== MODE APPLY ===' : '=== DRY RUN (ajoute --apply pour exécuter) ===');

  // 1. Tous les programmes, toutes catégories confondues.
  const snap = await db.collectionGroup('programs').get();
  const docs = snap.docs.filter((d) => d.ref.path.startsWith('scopes/'));
  console.log(`${docs.length} programmes trouvés.`);

  // 2. Détails YouTube par lots de 50 (dédoublonnés sur youtubeId).
  const ids = [...new Set(docs.map((d) => d.data().youtubeId).filter(Boolean))];
  const details = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const m = await fetchDetails(batch);
    for (const [k, v] of m) details.set(k, v);
    console.log(`  API : ${Math.min(i + 50, ids.length)}/${ids.length}`);
  }

  // 3. Tri.
  const toDelete = [];
  const toUpdate = [];
  for (const d of docs) {
    const p = d.data();
    const det = details.get(p.youtubeId);
    if (!det) {
      toDelete.push({ ref: d.ref, why: 'vidéo introuvable (privée/supprimée)', p });
      continue;
    }
    if (!playableInFrance(det)) {
      toDelete.push({ ref: d.ref, why: 'bloquée en France', p });
      continue;
    }
    const embeddable = det.status?.embeddable !== false;
    if (p.embeddable !== embeddable) {
      toUpdate.push({ ref: d.ref, embeddable, p });
    }
  }

  console.log(`\nÀ supprimer : ${toDelete.length}`);
  for (const t of toDelete) {
    console.log(`  - [${t.why}] ${t.p.creatorName} : ${t.p.title} (${t.p.youtubeId})`);
  }
  console.log(`\nÀ annoter (embeddable) : ${toUpdate.length}`);
  for (const t of toUpdate.filter((x) => !x.embeddable)) {
    console.log(`  - [embed interdit] ${t.p.creatorName} : ${t.p.title} (${t.p.youtubeId})`);
  }
  const okCount = toUpdate.filter((x) => x.embeddable).length;
  if (okCount) console.log(`  + ${okCount} programmes simplement marqués embeddable=true`);

  if (!APPLY) {
    console.log('\nDry run terminé, rien modifié.');
    return;
  }

  // 4. Écritures par batch de 400.
  const ops = [
    ...toDelete.map((t) => (b) => b.delete(t.ref)),
    ...toUpdate.map((t) => (b) => b.update(t.ref, { embeddable: t.embeddable })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    for (const op of ops.slice(i, i + 400)) op(b);
    await b.commit();
    console.log(`  batch ${Math.min(i + 400, ops.length)}/${ops.length}`);
  }
  console.log(`\nTerminé : ${toDelete.length} supprimés, ${toUpdate.length} annotés.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
