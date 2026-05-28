import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./firebase-admin-key.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const themes = [
  'cult_lettres','cult_langues','cult_histoire','cult_geog','cult_societe',
  'cult_sciences','cult_eco','cult_math','cult_physique','cult_bio',
  'cult_tech','cult_art','cult_musique','cult_audiovisuel','cult_sport',
  'cult_recherche','cult_psycho','cult_apprentissage','cult_enfants'
];

let totalCount = 0;
const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;

for (const t of themes) {
  const snap = await db.collection('scopes').doc(t).collection('programs').get();
  const recent = snap.docs.filter(d => (d.data().publishedAt || 0) >= sevenDaysAgo);
  totalCount += snap.size;
  console.log(`${t.padEnd(22)} total=${String(snap.size).padStart(3)} | 7j=${recent.length}`);
}
console.log('---');
console.log('TOTAL programs Culture:', totalCount);
process.exit(0);
