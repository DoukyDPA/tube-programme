// =====================================================================
// scripts/cap-programs-per-channel.js
// =====================================================================
// Nettoyage de scopes/{cult_xxx}/programs en trois passes :
//
//   1. Orphelins de scope : programs dont le channelId n'est plus
//      assigné à ce scope dans /channels (cas typique : chaîne déplacée
//      vers une autre catégorie, les vidéos sont restées dans l'ancien
//      scope). Ces programs sont marqués pour suppression.
//
//   2. Cap par chaîne : on garde les MAX_PER_CHANNEL plus récentes par
//      channelId (publishedAt desc, fallback createdAt desc).
//
//   3. Cap par scope : on rabote chaque scope à MAX_PER_SCOPE vidéos au
//      global (optionnel, désactivable par --no-scope-cap).
//
// Protection : tout program dont le youtubeId est dans le watch later
// d'au moins un user depuis moins de 30 jours est sorti de toDelete et
// remis dans toKeep, peu importe les caps. Aligné sur la protection
// implémentée dans api/sync-culture.js.
//
// Sans argument : DRY RUN. Affiche ce qui serait supprimé, sans toucher.
// Avec --apply : exécute les suppressions par batch de 400.
//
// Usage :
//   node scripts/cap-programs-per-channel.js               # dry run
//   node scripts/cap-programs-per-channel.js --apply       # exécution
//   node scripts/cap-programs-per-channel.js --apply --no-scope-cap
//
// Aligné sur api/sync-culture.js : MAX_PER_CHANNEL = 5,
// MAX_PER_SCOPE = CULTURE_VIDEOS_PER_THEME = 25,
// WATCH_LATER_PROTECTION_MS = 30 jours.
// =====================================================================

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-admin-key.json'), 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const SCOPE_CAP = !args.has('--no-scope-cap');

const MAX_PER_CHANNEL = 5;
const MAX_PER_SCOPE = 25;
const WATCH_LATER_PROTECTION_MS = 30 * 24 * 60 * 60 * 1000;

const ts = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—');

async function loadProtectedIds() {
  // Union des youtubeIds ajoutés au watch later il y a moins de 30 jours.
  // Ces vidéos sont conservées même si elles dépassent les caps.
  const threshold = Date.now() - WATCH_LATER_PROTECTION_MS;
  const ids = new Set();
  try {
    const snap = await db.collection('users').get();
    for (const u of snap.docs) {
      const wl = u.data().watchLaterCultureAddedAt || {};
      for (const [yid, t] of Object.entries(wl)) {
        if (typeof t === 'number' && t >= threshold) ids.add(yid);
      }
    }
  } catch (e) {
    console.warn('Lecture watchLaterCultureAddedAt échouée, protection désactivée :', e.message);
  }
  return ids;
}

async function main() {
  console.log('');
  console.log('====================================================');
  console.log(`  Cap programs par chaîne (max ${MAX_PER_CHANNEL}/chaîne, ${MAX_PER_SCOPE}/scope)`);
  console.log(`  Mode : ${APPLY ? 'APPLY (suppressions réelles)' : 'DRY RUN'}`);
  console.log('====================================================');
  console.log('');

  // 1. Récupère les chaînes Culture. On construit une map { catId -> Set<channelId> }
  //    pour identifier les programs orphelins (channelId pas attendu dans le scope).
  const chSnap = await db
    .collection('channels')
    .where('mode', '==', 'culture')
    .get();
  const catsUsed = new Set();
  const expectedByCat = new Map(); // catId -> Set<channelId>
  chSnap.docs.forEach((d) => {
    const c = d.data();
    if (!c.categoryId || !c.channelId) return;
    catsUsed.add(c.categoryId);
    if (!expectedByCat.has(c.categoryId)) expectedByCat.set(c.categoryId, new Set());
    expectedByCat.get(c.categoryId).add(c.channelId);
  });

  if (catsUsed.size === 0) {
    console.log('Aucune catégorie culture utilisée. Rien à faire.');
    process.exit(0);
  }

  // 2. Watch later : on charge l'ensemble des youtubeIds protégés.
  const protectedIds = await loadProtectedIds();
  console.log(`Watch later : ${protectedIds.size} youtubeId(s) protégé(s) (ajout < 30 j).`);
  console.log('');

  let grandTotalDeleted = 0;
  let grandTotalKept = 0;
  let grandOrphans = 0;

  // 3. Pour chaque scope, charge les programs, retire les orphelins, groupe, cap.
  for (const catId of Array.from(catsUsed).sort()) {
    const progsSnap = await db
      .collection('scopes')
      .doc(catId)
      .collection('programs')
      .get();
    const progs = progsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (progs.length === 0) continue;

    const expected = expectedByCat.get(catId) || new Set();

    // Sépare : programs sans channelId (à ignorer), orphelins (channel
    // plus assigné à ce scope), et les programs valides regroupés par
    // channelId pour le cap.
    const byChannel = new Map();
    const noChannelId = [];
    const scopeOrphans = []; // channelId présent mais pas attendu ici
    for (const p of progs) {
      const cid = p.channelId;
      if (!cid) {
        noChannelId.push(p);
        continue;
      }
      if (!expected.has(cid)) {
        scopeOrphans.push(p);
        continue;
      }
      if (!byChannel.has(cid)) byChannel.set(cid, []);
      byChannel.get(cid).push(p);
    }

    // Tri par récence : publishedAt desc, sinon createdAt desc
    const recency = (a, b) =>
      (b.publishedAt || 0) - (a.publishedAt || 0) ||
      (b.createdAt || 0) - (a.createdAt || 0);

    // Cap par chaîne
    const toKeep = [];
    const toDelete = [];
    for (const [cid, list] of byChannel.entries()) {
      list.sort(recency);
      const kept = list.slice(0, MAX_PER_CHANNEL);
      const dropped = list.slice(MAX_PER_CHANNEL);
      toKeep.push(...kept);
      toDelete.push(...dropped);
      if (dropped.length > 0) {
        console.log(
          `  ${catId} / ${cid} : garde ${kept.length}, supprime ${dropped.length} (la plus vieille : ${ts(dropped[dropped.length - 1].publishedAt)})`
        );
      }
    }

    // Cap global du scope, sur ce qui reste
    if (SCOPE_CAP && toKeep.length > MAX_PER_SCOPE) {
      toKeep.sort(recency);
      const overflow = toKeep.splice(MAX_PER_SCOPE);
      toDelete.push(...overflow);
      console.log(
        `  ${catId} : cap scope → +${overflow.length} programs retirés (dépassement du top ${MAX_PER_SCOPE})`
      );
    }

    if (noChannelId.length > 0) {
      console.log(
        `  ${catId} : ${noChannelId.length} program(s) sans channelId ignorés (à vérifier à la main)`
      );
    }

    // Orphelins de scope : programs dont la chaîne n'est plus assignée
    // à ce scope. On les ajoute à toDelete (sous réserve de la
    // protection watch later appliquée juste après).
    if (scopeOrphans.length > 0) {
      const byCh = {};
      for (const p of scopeOrphans) {
        byCh[p.channelId] = (byCh[p.channelId] || 0) + 1;
      }
      const summary = Object.entries(byCh)
        .map(([cid, n]) => `${cid} (${n})`)
        .join(', ');
      console.log(
        `  ${catId} : ${scopeOrphans.length} program(s) orphelin(s) (chaîne plus dans ce scope) → ${summary}`
      );
      toDelete.push(...scopeOrphans);
      grandOrphans += scopeOrphans.length;
    }

    // Protection watch later : on retire de toDelete tout ce qui est
    // dans la fenêtre 30 j, et on le rapatrie dans toKeep.
    const rescued = [];
    const survivors = [];
    for (const p of toDelete) {
      if (p.youtubeId && protectedIds.has(p.youtubeId)) {
        rescued.push(p);
      } else {
        survivors.push(p);
      }
    }
    if (rescued.length > 0) {
      toKeep.push(...rescued);
      console.log(
        `  ${catId} : ${rescued.length} program(s) rescapé(s) par protection watch later`
      );
    }
    const finalToDelete = survivors;

    console.log(
      `  ${catId} : ${progs.length} en base → ${toKeep.length} gardés, ${finalToDelete.length} à supprimer`
    );

    grandTotalKept += toKeep.length;
    grandTotalDeleted += finalToDelete.length;

    // 3. Suppressions
    if (APPLY && finalToDelete.length > 0) {
      const colRef = db.collection('scopes').doc(catId).collection('programs');
      for (let i = 0; i < finalToDelete.length; i += 400) {
        const batch = db.batch();
        for (const p of finalToDelete.slice(i, i + 400)) {
          batch.delete(colRef.doc(p.id));
        }
        await batch.commit();
      }
      console.log(`  ${catId} : ${finalToDelete.length} program(s) supprimés.`);
    }
    console.log('');
  }

  console.log('====================================================');
  console.log(`  Total : ${grandTotalKept} gardés, ${grandTotalDeleted} ${APPLY ? 'supprimés' : 'à supprimer'}`);
  if (grandOrphans > 0) {
    console.log(`  Dont ${grandOrphans} orphelin(s) de scope (chaîne plus dans ce scope).`);
  }
  if (!APPLY) {
    console.log('  Relance avec --apply pour exécuter.');
  }
  console.log('====================================================');
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erreur cap-programs-per-channel :', err);
  process.exit(1);
});
