// =====================================================================
// scripts/generate-admin-config.js
// =====================================================================
// Lit les variables d'environnement de .env et produit
// public/admin-config.json, consommé par public/admin-channels.html.
//
// Ce fichier est gitignored : les clés Firebase publiques restent en
// local et ne sont pas committées (même si elles sont par nature
// exposées côté client une fois servies).
//
// Usage :
//   node scripts/generate-admin-config.js
// =====================================================================

import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env') });

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_YOUTUBE_API_KEY',
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Variables manquantes dans .env :', missing.join(', '));
  process.exit(1);
}

const payload = {
  firebase: {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  },
  // Pour la résolution YouTube côté navigateur, on privilégie la clé
  // Culture (plus de quota) si dispo, sinon la principale.
  youtubeApiKey:
    process.env.VITE_YOUTUBE_API_KEY_CULTURE || process.env.VITE_YOUTUBE_API_KEY,
  generatedAt: Date.now(),
};

const outPath = join(__dirname, '..', 'public', 'admin-config.json');
writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log('admin-config.json généré ->', outPath);
