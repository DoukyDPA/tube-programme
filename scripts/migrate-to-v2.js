// =====================================================================
// scripts/migrate-to-v2.js
// =====================================================================
// Migre la collection legacy artifacts/{appId}/public/data/programs
// vers le nouveau modèle data v2 :
//   - scopes/{scopeId}/programs/{progId}            (catégories éditeur)
//   - users/{uid}/themes/{themeId}/programs/{progId} (thèmes perso users)
//
// Usage :
//   node scripts/migrate-to-v2.js              # dry-run, n'écrit rien
//   node scripts/migrate-to-v2.js --write      # exécution réelle
//
// L'ancienne collection N'EST PAS supprimée par ce script. Elle passe
// simplement en read-only via firestore.rules. À nettoyer manuellement
// une fois la v2 stabilisée (24 à 48 h après la migration).
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

// FIREBASE_APP_ID est défini EN DUR dans src/firebase.js ligne 19.
// Ce n'est PAS la valeur de VITE_FIREBASE_APP_ID de .env.
const FIREBASE_APP_ID = 'tube-prog-v0';

// Les 5 scopes éditeur (identiques à CATEGORIES dans src/App.jsx)
const SCOPE_IDS = new Set(['ia', 'lecture', 'foot', 'interviews', 'divertissement']);

const WRITE = process.argv.includes('--write');

console.log('');
console.log('====================================================');
console.log(`  Mode : ${WRITE ? 'WRITE (écriture réelle)' : 'DRY-RUN (lecture seule)'}`);
console.log(`  App  : ${FIREBASE_APP_ID}`);
console.log('====================================================');
console.log('');

const stats = {
  total: 0,
  toScope: 0,
  toUserTheme: 0,
  reassigned: 0,
  skippedNoTheme: 0,
  skippedNoOwner: 0,
  errors: 0,
};

const skippedDocs = [];

try {
  // Construit la map themeId -> ownerUid en scannant tous les thèmes existants.
  // Sert au rattachement des docs avec addedBy non fiable (ex : "system").
  console.log('Construction de la map themeId -> ownerUid...');
  const themesSnap = await db.collectionGroup('themes').get();
  const themeOwners = new Map();
  themesSnap.docs.forEach(d => {
    // Le path est users/{uid}/themes/{themeId}
    const parts = d.ref.path.split('/');
    if (parts.length >= 4 && parts[0] === 'users' && parts[2] === 'themes') {
      themeOwners.set(parts[3], parts[1]);
    }
  });
  console.log(`  ${themeOwners.size} thèmes recensés.\n`);

  const legacyRef = db.collection('artifacts').doc(FIREBASE_APP_ID)
                      .collection('public').doc('data').collection('programs');
  const snap = await legacyRef.get();

  stats.total = snap.size;
  console.log(`Trouvé ${stats.total} programmes dans la collection legacy.\n`);

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const progId = docSnap.id;
    const { categoryId, addedBy } = data;

    // Cas 1 : catégorie éditeur, va dans scopes/{categoryId}/programs/{progId}
    if (SCOPE_IDS.has(categoryId)) {
      console.log(`  [scope] ${progId} -> scopes/${categoryId}/programs/${progId}`);
      stats.toScope++;
      if (WRITE) {
        await db.collection('scopes').doc(categoryId)
                .collection('programs').doc(progId).set(data);
      }
      continue;
    }

    // Cas 2 : thème custom user, vérifie d'abord que users/{addedBy}/themes/{categoryId} existe
    let ownerUid = addedBy;
    let reassigned = false;

    if (addedBy) {
      const themeRef = db.collection('users').doc(addedBy)
                         .collection('themes').doc(categoryId);
      const themeSnap = await themeRef.get();
      if (!themeSnap.exists) {
        // L'addedBy actuel n'a pas ce thème. Cas typique : addedBy = "system".
        // On cherche le vrai propriétaire dans la map themeOwners.
        const realOwner = themeOwners.get(categoryId);
        if (realOwner) {
          ownerUid = realOwner;
          reassigned = true;
        } else {
          console.log(`  [SKIP] ${progId} thème ${categoryId} introuvable chez addedBy=${addedBy} ET inexistant ailleurs`);
          skippedDocs.push({ id: progId, raison: 'thème inexistant nulle part', addedBy, categoryId });
          stats.skippedNoTheme++;
          continue;
        }
      }
    } else {
      // Pas de addedBy du tout. On tente la résolution par themeOwners.
      const realOwner = themeOwners.get(categoryId);
      if (realOwner) {
        ownerUid = realOwner;
        reassigned = true;
      } else {
        console.log(`  [SKIP] ${progId} sans addedBy et thème ${categoryId} introuvable`);
        skippedDocs.push({ id: progId, raison: 'addedBy manquant + thème inexistant', categoryId });
        stats.skippedNoOwner++;
        continue;
      }
    }

    // Si on a réassigné, on réécrit addedBy pour cohérence avec les futures règles.
    const dataToWrite = reassigned ? { ...data, addedBy: ownerUid } : data;

    if (reassigned) {
      console.log(`  [theme*] ${progId} -> users/${ownerUid}/themes/${categoryId}/programs/${progId}  (addedBy ${addedBy || 'absent'} -> ${ownerUid})`);
      stats.reassigned++;
    } else {
      console.log(`  [theme]  ${progId} -> users/${ownerUid}/themes/${categoryId}/programs/${progId}`);
    }
    stats.toUserTheme++;
    if (WRITE) {
      await db.collection('users').doc(ownerUid)
              .collection('themes').doc(categoryId)
              .collection('programs').doc(progId)
              .set(dataToWrite);
    }
  }

  console.log('');
  console.log('====================================================');
  console.log(`  Total              : ${stats.total}`);
  console.log(`  Vers scopes        : ${stats.toScope}`);
  console.log(`  Vers userThemes    : ${stats.toUserTheme}`);
  console.log(`  Dont réassignés    : ${stats.reassigned}`);
  console.log(`  Skipped (theme)    : ${stats.skippedNoTheme}`);
  console.log(`  Skipped (owner)    : ${stats.skippedNoOwner}`);
  console.log('====================================================');

  if (skippedDocs.length > 0) {
    console.log('');
    console.log('Détail des skips :');
    skippedDocs.forEach(s => console.log('  ', JSON.stringify(s)));
  }

  console.log('');
  if (!WRITE) {
    console.log('Dry-run terminé. Si tout te paraît correct, relance avec :');
    console.log('  node scripts/migrate-to-v2.js --write');
  } else {
    console.log('Migration terminée. L\'ancienne collection est encore là, en read-only.');
    console.log('Tu pourras la supprimer dans 24 à 48 h via la console Firebase.');
  }
  console.log('');

  process.exit(0);
} catch (err) {
  console.error('Erreur migration :', err.message);
  process.exit(1);
}
