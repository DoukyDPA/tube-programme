import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import 'dotenv/config';

import syncHandler from './api/sync.js';
import syncCultureHandler from './api/sync-culture.js';
import channelsCultureHandler from './api/channels-culture.js';
import channelsTubiscopeHandler from './api/channels-tubiscope.js';
import {
  listUsersHandler,
  toggleStudioHandler,
  deleteUserHandler,
} from './api/admin-users.js';
import generateNewsletterHandler from './api/generate-newsletter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ── Content-Security-Policy ───────────────────────────────────────────────────
// Politique restrictive : on autorise uniquement les origines nécessaires.
// 'unsafe-inline' sur style-src est conservé pour Tailwind (purge runtime).
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
      "img-src 'self' data: https://i.ytimg.com https://img.youtube.com https://*.googleusercontent.com",
      "font-src 'self' data:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  );
  next();
});

const PORT = process.env.PORT || 3000;

// ── CORS ─────────────────────────────────────────────────────────────────────
// Whitelist explicite. ALLOWED_ORIGINS en production (ex: "https://tubiscope.fr").
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

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

app.get('/api/sync', syncHandler);
app.get('/api/sync-culture', syncCultureHandler);

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
}, { timezone: 'Europe/Paris' });

console.log("⏰ CRON programmé : 08:00 Europe/Paris (sync + sync-culture).");

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
