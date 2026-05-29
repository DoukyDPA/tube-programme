// =====================================================================
// api/generate-newsletter.js
// =====================================================================
// Endpoint admin : génère le numéro de newsletter de la semaine.
//
//   GET /api/admin/newsletter?window=7&max=5
//
// - Vérifie le token Firebase et le claim admin (même pattern que
//   api/admin-users.js).
// - Appelle generateNewsletter() défini dans scripts/generate-newsletter.js.
// - Persiste le JSON et le HTML dans newsletter/{date}.{json,html}.
// - Retourne { success, issue, html, files: { json, html } }.
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

import { generateNewsletter } from '../scripts/generate-newsletter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const initAdmin = () => {
  if (getApps().length > 0) return { auth: getAuth() };
  let credential;
  if (process.env.FIREBASE_ADMIN_KEY_JSON) {
    credential = cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY_JSON));
  } else {
    const keyPath = join(__dirname, '..', 'firebase-admin-key.json');
    const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
    credential = cert(sa);
  }
  initializeApp({ credential });
  return { auth: getAuth() };
};

async function requireAdmin(req, res) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/);
  if (!m) {
    res.status(401).json({ success: false, error: 'Token manquant.' });
    return null;
  }
  try {
    const { auth } = initAdmin();
    const decoded = await auth.verifyIdToken(m[1]);
    if (!decoded.admin) {
      res.status(403).json({ success: false, error: 'Accès réservé aux admins.' });
      return null;
    }
    return decoded;
  } catch (e) {
    res.status(401).json({ success: false, error: 'Token invalide : ' + e.message });
    return null;
  }
}

export default async function generateNewsletterHandler(req, res) {
  const decoded = await requireAdmin(req, res);
  if (!decoded) return;

  const windowDays = Math.max(1, Math.min(30, parseInt(req.query?.window || '7', 10) || 7));
  const maxPicks = Math.max(1, Math.min(20, parseInt(req.query?.max || '5', 10) || 5));

  try {
    const { issue, html } = await generateNewsletter({ maxPicks, windowDays });

    // Persiste les fichiers dans newsletter/ (utile pour traçabilité).
    const outDir = join(__dirname, '..', 'newsletter');
    mkdirSync(outDir, { recursive: true });
    const jsonPath = join(outDir, `${issue.issueDate}.json`);
    const htmlPath = join(outDir, `${issue.issueDate}.html`);
    writeFileSync(jsonPath, JSON.stringify(issue, null, 2));
    writeFileSync(htmlPath, html);

    res.json({
      success: true,
      issue,
      html,
      files: {
        json: `newsletter/${issue.issueDate}.json`,
        html: `newsletter/${issue.issueDate}.html`,
      },
    });
  } catch (e) {
    console.error('Erreur generate-newsletter :', e);
    res.status(500).json({ success: false, error: e.message });
  }
}
