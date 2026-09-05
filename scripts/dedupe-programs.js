// =====================================================================
// scripts/dedupe-programs.js
// =====================================================================
// Supprime les doublons de scopes/{scopeId}/programs : plusieurs
// documents décrivant la même vidéo YouTube dans un même scope.
//
// D'où ils viennent : un sync interrompu en cours d'écriture (quota
// Firestore coupé, redémarrage Railway au mauvais moment) ré-ajoute des
// vidéos déjà présentes, puisque la détection de doublon se fait sur ce
// qu'il a lu avant de tomber. Constaté le 5 septembre 2026 : 652
// documents en base pour environ 275 vidéos uniques.
//
// L'application ne montre déjà qu'une occurrence de chaque vidéo, la
// déduplication étant faite à la lecture (src/utils/programs.js,
// api/public-snapshot.js). Ce script fait le ménage en base, ce qui
// allège le stockage, les lectures de l'admin et les batches de sync.
//
// Règle de choix : on garde le document au createdAt le plus récent,
// exactement le même critère qu'à la lecture. Ce qui est affiché
// aujourd'hui reste donc affiché demain.
//
// Le champ pitch (texte éditorial saisi à la main) est préservé : si le
// document gardé n'en a pas et qu'un doublon en a un, il est recopié sur
// le gardé avant suppression.
//
// Pas besoin de protection watch later ici : on conserve toujours une
// occurrence de chaque youtubeId, donc aucune vidéo mise de côté par un
// utilisateur ne disparaît.
//
// Une sauvegarde JSON de tout ce qui serait supprimé est écrite à chaque
// exécution, dry run compris, dans scripts/backups/.
//
// Usage :
//   node scripts/dedupe-programs.js                    # dry run, tous les scopes
//   node scripts/dedupe-programs.js --apply            # exécution
//   node scripts/dedupe-programs.js --mode=culture     # dry run, scopes culture
//   node scripts/dedupe-programs.js --mode=tubiscope --apply
//
// Sans --apply : rien n'est touché, le script affiche ce qu'il ferait.
// =====================================================================

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-admin-key.json'), 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const rawArgs = process.argv.slice(2);
const APPLY = rawArgs.includes('--apply');

const modeArg = rawArgs.find((a) => a.startsWith('--mode='));
const MODE = modeArg ? modeArg.split('=')[1] : 'all';
const VALID_MODES = ['culture', 'tubiscope', 'all'];
if (!VALID_MODES.includes(MODE)) {
  console.error(
    `--mode invalide : ${MODE}. Valeurs autorisées : ${VALID_MODES.join(', ')}.`
  );
  process.exit(1);
}

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—');

// Scopes à traiter. En mode 'all' on prend tous les documents de
// /scopes, y compris ceux qui n'ont plus de catégorie associée : ce sont
// justement ceux que personne ne surveille.
async function listScopeIds() {
  const all = (await db.collection('scopes').listDocuments()).map((d) => d.id);
  if (MODE === 'all') return all.sort();

  const catSnap = await db.collection('categories').where('mode', '==', MODE).get();
  const wanted = new Set(catSnap.docs.map((d) => d.id));
  return all.filter((id) => wanted.has(id)).sort();
}

async function main() {
  console.log('');
  console.log('====================================================');
  console.log('  Déduplication des programmes par youtubeId');
  console.log(`  Cible : ${MODE === 'all' ? 'tous les scopes' : `mode ${MODE}`}`);
  console.log(`  Mode exécution : ${APPLY ? 'APPLY (suppressions réelles)' : 'DRY RUN'}`);
  console.log('====================================================');
  console.log('');

  const scopeIds = await listScopeIds();
  if (scopeIds.length === 0) {
    console.log('Aucun scope à traiter.');
    process.exit(0);
  }

  const backup = [];       // documents qui seront supprimés
  const pitchFixes = [];   // { scopeId, docId, pitch } à recopier sur le gardé
  let totalDocs = 0;
  let totalUnique = 0;
  let totalToDelete = 0;
  let totalNoYid = 0;

  for (const scopeId of scopeIds) {
    const colRef = db.collection('scopes').doc(scopeId).collection('programs');
    const snap = await colRef.get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (docs.length === 0) continue;

    totalDocs += docs.length;

    // Les documents sans youtubeId ne sont jamais supprimés : on ne sait
    // pas les rapprocher d'une vidéo, ils sont signalés pour inspection.
    const byYid = new Map();
    let noYid = 0;
    for (const p of docs) {
      if (!p.youtubeId) {
        noYid++;
        continue;
      }
      if (!byYid.has(p.youtubeId)) byYid.set(p.youtubeId, []);
      byYid.get(p.youtubeId).push(p);
    }
    totalNoYid += noYid;
    totalUnique += byYid.size;

    const toDelete = [];
    for (const [yid, list] of byYid.entries()) {
      if (list.length === 1) continue;

      // Même critère qu'à la lecture : createdAt le plus récent gagne.
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const [kept, ...dupes] = list;

      // Récupération du pitch éditorial s'il n'est que sur un doublon.
      if (!kept.pitch) {
        const withPitch = dupes.find((d) => d.pitch);
        if (withPitch) {
          pitchFixes.push({ scopeId, docId: kept.id, pitch: withPitch.pitch, youtubeId: yid });
        }
      }

      for (const d of dupes) {
        toDelete.push(d);
        backup.push({ scopeId, ...d });
      }
    }

    if (noYid > 0) {
      console.log(`  ${scopeId} : ${noYid} document(s) sans youtubeId, laissés en place`);
    }

    if (toDelete.length > 0) {
      const oldest = toDelete.reduce(
        (min, d) => ((d.createdAt || 0) < (min.createdAt || Infinity) ? d : min),
        toDelete[0]
      );
      console.log(
        `  ${scopeId} : ${docs.length} documents → ${byYid.size} vidéos uniques, ${toDelete.length} doublon(s) à supprimer (le plus ancien : ${day(oldest.createdAt)})`
      );
      totalToDelete += toDelete.length;

      if (APPLY) {
        for (let i = 0; i < toDelete.length; i += 400) {
          const batch = db.batch();
          for (const d of toDelete.slice(i, i + 400)) batch.delete(colRef.doc(d.id));
          await batch.commit();
        }
        console.log(`  ${scopeId} : ${toDelete.length} doublon(s) supprimés.`);
      }
    } else {
      console.log(`  ${scopeId} : ${docs.length} documents, aucun doublon`);
    }
  }

  // Sauvegarde systématique, dry run compris.
  const backupDir = join(__dirname, 'backups');
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = join(backupDir, `dedupe-${APPLY ? 'applied' : 'dryrun'}-${ts}.json`);
  writeFileSync(outFile, JSON.stringify(backup, null, 2), 'utf8');

  // Recopie des pitchs orphelins, après les suppressions.
  if (pitchFixes.length > 0) {
    console.log('');
    console.log(`  ${pitchFixes.length} pitch(s) éditoriaux présents seulement sur un doublon :`);
    for (const f of pitchFixes) {
      console.log(`    ${f.scopeId} / ${f.youtubeId} : « ${String(f.pitch).slice(0, 60)} »`);
    }
    if (APPLY) {
      for (let i = 0; i < pitchFixes.length; i += 400) {
        const batch = db.batch();
        for (const f of pitchFixes.slice(i, i + 400)) {
          batch.set(
            db.collection('scopes').doc(f.scopeId).collection('programs').doc(f.docId),
            { pitch: f.pitch },
            { merge: true }
          );
        }
        await batch.commit();
      }
      console.log(`  ${pitchFixes.length} pitch(s) recopiés sur le document conservé.`);
    }
  }

  console.log('');
  console.log('====================================================');
  console.log(`  ${totalDocs} documents lus dans ${scopeIds.length} scope(s)`);
  console.log(`  ${totalUnique} vidéos uniques`);
  console.log(`  ${totalToDelete} doublon(s) ${APPLY ? 'supprimés' : 'à supprimer'}`);
  if (totalNoYid > 0) {
    console.log(`  ${totalNoYid} document(s) sans youtubeId, laissés en place`);
  }
  console.log(`  Sauvegarde : ${outFile}`);
  if (!APPLY) {
    console.log('  Relance avec --apply pour exécuter.');
  }
  console.log('====================================================');
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erreur dedupe-programs :', err);
  process.exit(1);
});
