import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import 'dotenv/config'; // Pour charger les variables d'environnement en local

// Importer votre fonction sync existante
import syncHandler from './api/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- NOUVEAU CODE À AJOUTER ---
// On force une politique de sécurité très souple pour empêcher 
// les extensions (comme CheckPoint) de bloquer l'affichage.
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});
// -----------------------------
const PORT = process.env.PORT || 3000; // Railway injectera dynamiquement son propre PORT

app.use(cors());
app.use(express.json());

// 1. Définition de la route API
app.get('/api/sync', syncHandler);

// 2. Remplacement du vercel.json (CRON job)
// Exécution tous les jours à 08:00
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ Exécution du CRON : Synchronisation YouTube');
  try {
    // On simule req et res pour réutiliser votre fonction existante
    const req = {};
    const res = { 
        status: (code) => ({ json: (data) => console.log(`CRON Terminé [${code}]:`, data) }) 
    };
    await syncHandler(req, res);
  } catch (err) {
    console.error('Erreur lors du CRON:', err);
  }
});

// 3. Servir les fichiers statiques du frontend (dossier dist généré par Vite)
app.use(express.static(path.join(__dirname, 'dist')));

// Rediriger toutes les autres requêtes vers l'index.html (pour le routing React)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
