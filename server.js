import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { readFileSync } from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import 'dotenv/config';

import syncHandler from './api/sync.js';
import syncCultureHandler from './api/sync-culture.js';
import syncPersoHandler from './api/sync-perso.js';
import channelsCultureHandler from './api/channels-culture.js';
import channelsTubiscopeHandler from './api/channels-tubiscope.js';
import {
  listUsersHandler,
  toggleStudioHandler,
  deleteUserHandler,
} from './api/admin-users.js';
import generateNewsletterHandler from './api/generate-newsletter.js';
import publicSnapshotHandler, {
  invalidateSnapshot,
  statsHandler,
  getPublicStats,
} from './api/public-snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ── Content-Security-Policy ───────────────────────────────────────────────────
// La CSP est désormais livrée via une balise <meta http-equiv> dans index.html
// et admin-channels.html, et non plus via cet en-tête HTTP.
// Raison : l'app est une PWA. Le service worker précache la page et fige les
// en-têtes HTTP de la réponse mise en cache. Une CSP en en-tête restait donc
// gravée dans le cache du SW et ne se mettait jamais à jour (le hash de la page
// ne change pas quand seul un en-tête change). En meta, la CSP fait partie du
// contenu : toute modif change le hash, le SW recharge et la propage.
// Voir index.html et public/admin-channels.html pour la politique active.

const PORT = process.env.PORT || 3000;

// Indique à Express de faire confiance au premier proxy (Nginx, Render, Railway…)
// afin que express-rate-limit lise la vraie IP depuis X-Forwarded-For.
app.set('trust proxy', 1);

// ── Domaine canonique ────────────────────────────────────────────────
// tubiscope.com et tubiscope.fr servent la même application et la même
// base. Mais pour un navigateur, ce sont deux origines, donc deux
// stockages : une session Firebase ouverte sur l'un ne vaut rien sur
// l'autre, et le même visiteur doit s'inscrire deux fois. On garde donc
// une seule origine réelle, et tubiscope.fr devient ce qu'il a toujours
// été dans l'idée : un raccourci vers la partie Culture.
//
// Le code 302 est délibéré. Un 301 se grave dans le cache des
// navigateurs et se reprend très mal si le domaine principal change
// d'avis. À passer en 301 quand le choix sera arrêté.
const CANONICAL_HOST = process.env.CANONICAL_HOST || 'tubiscope.com';
const LEGACY_CULTURE_HOST = process.env.LEGACY_CULTURE_HOST || 'tubiscope.fr';
const CANONICAL_REDIRECT_CODE = Number(process.env.CANONICAL_REDIRECT_CODE || 302);
const CULTURE_PATH = '/culture';

app.use((req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  if (!host.endsWith(LEGACY_CULTURE_HOST)) return next();

  // Les appels d'API restent servis sur place : une application déjà
  // ouverte, ou un service worker installé avant la bascule, continue de
  // fonctionner sans rien casser.
  if (req.path.startsWith('/api/')) return next();

  const target = req.path === '/' ? CULTURE_PATH : req.path;
  const qsIndex = req.originalUrl.indexOf('?');
  const qs = qsIndex >= 0 ? req.originalUrl.slice(qsIndex) : '';
  return res.redirect(CANONICAL_REDIRECT_CODE, `https://${CANONICAL_HOST}${target}${qs}`);
});

// ── Garde-fou des endpoints de synchronisation ────────────────────────────────
// /api/sync et /api/sync-culture écrivent dans Firestore via le service account
// (bypass des rules) et consomment le quota YouTube. Sans protection, n'importe
// qui peut les marteler. On exige donc un secret partagé dans l'en-tête
// `x-cron-secret`, comparé en temps constant à process.env.SYNC_SECRET.
//
// Le cron interne appelle les handlers en direct (pas via cette route HTTP),
// il n'est donc pas soumis à ce contrôle.
function requireSyncSecret(req, res, next) {
  const expected = process.env.SYNC_SECRET || '';
  const provided = req.get('x-cron-secret') || '';

  // Fail-closed : si le secret n'est pas configuré, on refuse tout appel HTTP.
  if (!expected) {
    return res.status(503).json({ success: false, error: 'Sync désactivé : SYNC_SECRET non configuré.' });
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, error: 'Non autorisé.' });
  }
  next();
}

// ── CORS ─────────────────────────────────────────────────────────────────────
// Whitelist explicite. ALLOWED_ORIGINS en production (ex: "https://tubiscope.fr").
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://tubiscope.fr',
      'https://www.tubiscope.fr',
      'https://tubiscope.com',
      'https://www.tubiscope.com',
    ];

app.use(cors({
  origin: (origin, cb) => {
    // Requêtes sans origin (Postman, cron interne) : autorisées côté serveur
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Origin non autorisée par CORS'));
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const hydrateLimiter = rateLimit({
  windowMs: 60 * 1000,        // fenêtre de 1 minute
  max: 30,                     // 30 requêtes/min par IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Trop de requêtes, réessaie dans une minute.' },
});

// ── Regex validation YouTube ID ───────────────────────────────────────────────
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

// ── Cache mémoire YouTube ─────────────────────────────────────────────────────
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures
let youtubeCache = {}; // Format: { "videoId": { data: {...}, timestamp: 123456789 } }

app.post('/api/hydrate', hydrateLimiter, async (req, res) => {
  try {
    const { videoIds } = req.body;
    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'Liste videoIds invalide' });
    }
    if (videoIds.length > 200) {
      return res.status(400).json({ error: 'videoIds limité à 200 par requête' });
    }
    const invalidId = videoIds.find(id => typeof id !== 'string' || !YOUTUBE_ID_RE.test(id));
    if (invalidId !== undefined) {
      return res.status(400).json({ error: `Format de videoId invalide : "${invalidId}"` });
    }

    const now = Date.now();
    const idsToFetch = [];
    const result = {};

    // 1. On vérifie ce qui est déjà dans le cache
    for (const id of videoIds) {
      if (youtubeCache[id] && (now - youtubeCache[id].timestamp < CACHE_TTL)) {
        result[id] = youtubeCache[id].data;
      } else {
        idsToFetch.push(id);
      }
    }

    // 2. S'il manque des vidéos, on interroge l'API YouTube
    if (idsToFetch.length > 0) {
      // Côté serveur : on prend la clé serveur (sans restriction Referer)
      // en priorité, et on retombe sur la clé front si elle est absente.
      const YOUTUBE_API_KEY =
        process.env.YOUTUBE_API_KEY_SERVER || process.env.VITE_YOUTUBE_API_KEY;
      
      // On regroupe les appels par paquets de 50 (limite de l'API YouTube)
      for (let i = 0; i < idsToFetch.length; i += 50) {
        const chunk = idsToFetch.slice(i, i + 50).join(',');
        const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${chunk}&part=snippet`);
        const ytData = await ytRes.json();
        
        if (ytData.items) {
          ytData.items.forEach(item => {
            const data = {
              title: item.snippet.title,
              creatorName: item.snippet.channelTitle,
              publishedAt: new Date(item.snippet.publishedAt).getTime(),
            };
            result[item.id] = data; // On l'ajoute à la réponse
            youtubeCache[item.id] = { data, timestamp: now }; // On le sauvegarde dans le cache
          });
        }
      }
    }

    // 3. On retourne les données (mélange de cache et de données fraîches)
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Erreur hydratation Serveur:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
// ----------------------------------------------

// Toute synchronisation qui touche les scopes éditeur rend le snapshot
// public périmé : on le vide juste après, la prochaine requête le
// reconstruira avec les nouveautés.
const withSnapshotInvalidation = (handler, mode) => async (req, res) => {
  try {
    return await handler(req, res);
  } finally {
    invalidateSnapshot(mode);
  }
};

app.get('/api/sync', requireSyncSecret, withSnapshotInvalidation(syncHandler, 'tubiscope'));
app.get('/api/sync-culture', requireSyncSecret, withSnapshotInvalidation(syncCultureHandler, 'culture'));
app.get('/api/sync-perso', requireSyncSecret, syncPersoHandler);

// Snapshot public : catégories + programmes d'un mode, servis depuis un
// cache mémoire, sans authentification. C'est ce que lisent les visiteurs
// et les utilisateurs non-admin, à la place des listeners Firestore.
app.get('/api/snapshot', publicSnapshotHandler);

// Nombre de chaînes et de thématiques par mode. Ces chiffres sont cités
// dans plusieurs écrans, ils changent à chaque ajout ou retrait de
// chaîne : l'interface les lit ici plutôt que de les écrire en dur.
app.get('/api/stats', statsHandler);

// Liste des chaînes Culture servie depuis un cache mémoire (TTL 1h).
// Évite que chaque ouverture de Culture côté client lise /channels Firestore.
app.get('/api/channels/culture', channelsCultureHandler);

// Pendant pour les scopes éditeur Tubiscope. Sert la liste /channels
// mode=tubiscope, utilisée par l'AdminPanel pour afficher toutes les
// chaînes d'un scope même celles sans vidéo encore synchronisée.
app.get('/api/channels/tubiscope', channelsTubiscopeHandler);

// ---------- Admin des utilisateurs ----------
// Toutes ces routes vérifient le token Firebase et le claim admin
// directement dans le handler (cf. api/admin-users.js).
app.get('/api/admin/users', listUsersHandler);
app.post('/api/admin/users/:uid/studio', toggleStudioHandler);
app.delete('/api/admin/users/:uid', deleteUserHandler);

// ---------- Newsletter (admin) ----------
app.get('/api/admin/newsletter', generateNewsletterHandler);

// Le serveur tourne en UTC chez l'hébergeur. On force l'heure de Paris
// pour que '0 8 * * *' signifie bien 8h heure locale (et pas 10h en été).
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ CRON : Synchronisation YouTube (standard) à', new Date().toString());
  try {
    const req = {};
    const res = {
      status: (code) => ({ json: (data) => console.log(`CRON sync [${code}]:`, data) })
    };
    await syncHandler(req, res);
  } catch (err) {
    console.error('Erreur lors du CRON sync:', err);
  }

  // Sync Culture juste après, dans la même fenêtre nocturne
  console.log('⏰ CRON : Synchronisation YouTube (Culture)');
  try {
    const req = {};
    const res = {
      status: (code) => ({ json: (data) => console.log(`CRON sync-culture [${code}]:`, data) })
    };
    await syncCultureHandler(req, res);
  } catch (err) {
    console.error('Erreur lors du CRON sync-culture:', err);
  }

  // Sync des thèmes perso en dernier, dans la même fenêtre nocturne
  console.log('⏰ CRON : Synchronisation YouTube (thèmes perso)');
  try {
    const req = {};
    const res = {
      status: (code) => ({ json: (data) => console.log(`CRON sync-perso [${code}]:`, data) })
    };
    await syncPersoHandler(req, res);
  } catch (err) {
    console.error('Erreur lors du CRON sync-perso:', err);
  }

  // Les trois syncs ont écrit dans Firestore : le snapshot public servi
  // aux visiteurs est périmé. On le vide pour que la journée démarre sur
  // les nouveautés du matin.
  invalidateSnapshot();
  console.log('🧹 Snapshot public invalidé après le cron.');
}, { timezone: 'Europe/Paris' });

console.log("⏰ CRON programmé : 08:00 Europe/Paris (sync + sync-culture + sync-perso).");

// Page publique « D'où vient Tubiscope » : origine du projet, principes
// et charte éditoriale. Servie sur une vraie URL, sans JavaScript, pour
// rester partageable par lien et lisible par les moteurs. Le fichier
// vient de public/, que le build Vite recopie dans dist/.
//
// Les chiffres de la page (nombre de chaînes et de thématiques) sont des
// gabarits remplis ici, au moment de servir. Pas de JavaScript côté
// client, donc pas d'exception à ajouter à la CSP de la page, et pas de
// chiffre périmé dans un fichier statique.
let aProposTemplate = null;

function renderAPropos(stats) {
  if (aProposTemplate === null) {
    aProposTemplate = readFileSync(path.join(__dirname, 'dist', 'a-propos.html'), 'utf8');
  }
  return aProposTemplate
    .replaceAll('{{CULTURE_CHANNELS}}', String(stats.culture.channels))
    .replaceAll('{{CULTURE_THEMES}}', String(stats.culture.themes));
}

app.get('/a-propos.html', (req, res) => res.redirect(301, '/a-propos'));

app.get('/a-propos', async (req, res) => {
  try {
    const stats = await getPublicStats();
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=900');
    return res.status(200).send(renderAPropos(stats));
  } catch (err) {
    console.warn('/a-propos : rendu échoué, envoi du fichier brut.', err.message);
    return res.sendFile(path.join(__dirname, 'dist', 'a-propos.html'));
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
