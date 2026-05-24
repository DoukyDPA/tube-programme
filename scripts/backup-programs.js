// =====================================================================
// scripts/backup-programs.js
// =====================================================================
// Exporte la collection legacy artifacts/{appId}/public/data/programs
// dans un fichier JSON horodaté, à conserver avant la migration v2.
//
// Usage :
//   node scripts/backup-programs.js
//
// Sortie :
//   scripts/backups/programs-{timestamp}.json
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

// FIREBASE_APP_ID est défini EN DUR dans src/firebase.js ligne 19.
// Ce n'est PAS la valeur de VITE_FIREBASE_APP_ID de .env.
// Si tu changes la valeur côté front, change-la aussi ici.
const FIREBASE_APP_ID = 'tube-prog-v0';

const backupDir = join(__dirname, 'backups');
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = join(backupDir, `programs-${ts}.json`);

try {
  const ref = db.collection('artifacts').doc(FIREBASE_APP_ID)
                .collection('public').doc('data').collection('programs');
  const snap = await ref.get();

  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  writeFileSync(outFile, JSON.stringify(docs, null, 2), 'utf8');

  console.log('');
  console.log('====================================================');
  console.log(`  ${docs.length} programmes sauvegardés`);
  console.log(`  Fichier : ${outFile}`);
  console.log('====================================================');
  console.log('');
  process.exit(0);
} catch (err) {
  console.error('Erreur backup :', err.message);
  process.exit(1);
}
