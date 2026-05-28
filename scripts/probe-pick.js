import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./firebase-admin-key.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// 5 thèmes retenus pour le 1er numéro
const picks = [
  { theme: 'cult_histoire', label: 'Histoire', target: { creator: 'Nota Bene', titlePart: 'Afrique' } },
  { theme: 'cult_lettres', label: 'Lettres & Littérature', target: { creator: 'Mediaclasse', titlePart: 'RIMBAUD' } },
  { theme: 'cult_eco', label: 'Économie', target: { creator: 'Réveilleur', titlePart: 'Bois' } },
  { theme: 'cult_tech', label: 'Technologie & Informatique', target: { creator: 'Micode', titlePart: 'infiltré' } },
  { theme: 'cult_recherche', label: 'Recherche & Culture générale', target: { creator: 'Arkeo', titlePart: 'mascottes' } },
];

const out = [];
for (const p of picks) {
  const snap = await db.collection('scopes').doc(p.theme).collection('programs')
    .orderBy('publishedAt', 'desc').limit(20).get();
  const match = snap.docs.map(d => d.data()).find(v =>
    (v.creatorName||'').toLowerCase().includes(p.target.creator.toLowerCase())
    && (v.title||'').toLowerCase().includes(p.target.titlePart.toLowerCase()));
  if (!match) {
    console.log('NOT FOUND for', p.label, p.target);
    continue;
  }
  out.push({
    theme: p.theme,
    themeLabel: p.label,
    title: match.title,
    creatorName: match.creatorName,
    youtubeId: match.youtubeId,
    publishedAt: match.publishedAt,
    publishedDate: new Date(match.publishedAt).toISOString().slice(0,10),
    url: `https://www.youtube.com/watch?v=${match.youtubeId}`,
    thumb: `https://i.ytimg.com/vi/${match.youtubeId}/hqdefault.jpg`,
  });
}
console.log(JSON.stringify(out, null, 2));
process.exit(0);
