import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./firebase-admin-key.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const themes = [
  ['cult_lettres','Lettres & Littérature'],
  ['cult_langues','Langue française & Linguistique'],
  ['cult_histoire','Histoire'],
  ['cult_geog','Géographie & Géopolitique'],
  ['cult_societe','Société, Droit & Civique'],
  ['cult_sciences','Philosophie & Esprit critique'],
  ['cult_eco','Économie'],
  ['cult_math','Mathématiques'],
  ['cult_physique','Physique, Chimie & Astronomie'],
  ['cult_bio','Biologie, Médecine & Paléontologie'],
  ['cult_tech','Technologie & Informatique'],
  ['cult_art',"Arts & Histoire de l'art"],
  ['cult_musique','Musique'],
  ['cult_audiovisuel','Audiovisuel, Cinéma & Jeu vidéo'],
  ['cult_sport','Sport'],
  ['cult_recherche','Recherche & Culture générale'],
  ['cult_psycho','Psychologie'],
  ['cult_apprentissage','Méthodologie & Apprentissage'],
  ['cult_enfants','YouTube pour les plus jeunes']
];

for (const [tid, label] of themes) {
  const snap = await db.collection('scopes').doc(tid).collection('programs')
    .orderBy('publishedAt', 'desc').limit(3).get();
  const items = snap.docs.map(d => d.data());
  console.log(`\n## ${label} (${tid})`);
  for (const it of items) {
    const d = new Date(it.publishedAt).toISOString().slice(0,10);
    console.log(`  [${d}] ${it.creatorName} — ${it.title?.slice(0,80)}`);
  }
}
process.exit(0);
