import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import 'dotenv/config'; 

import syncHandler from './api/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- NOUVEAU : SYSTÈME DE CACHE EN MÉMOIRE ---
const CACHE_TTL = 24 * 60 * 60 * 1000; // Durée de vie du cache : 24 heures
let youtubeCache = {}; // Format: { "videoId": { data: {...}, timestamp: 123456789 } }

app.post('/api/hydrate', async (req, res) => {
  try {
    const { videoIds } = req.body;
    if (!videoIds || !Array.isArray(videoIds)) {
      return res.status(400).json({ error: 'Liste videoIds invalide' });
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
      // Utilisez la clé API stockée de manière sécurisée côté serveur
      const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY; 
      
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

cron.schedule('0 8 * * *', async () => {
  console.log('⏰ Exécution du CRON : Synchronisation YouTube');
  try {
    const req = {};
    const res = { 
        status: (code) => ({ json: (data) => console.log(`CRON Terminé [${code}]:`, data) }) 
    };
    await syncHandler(req, res);
  } catch (err) {
    console.error('Erreur lors du CRON:', err);
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
