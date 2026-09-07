// =====================================================================
// api/channel-proposals.js
// =====================================================================
// Remontée de chaînes par les membres.
//
//   GET  /api/propose-channel/quota : ce qu'il reste ce mois-ci
//   POST /api/propose-channel       : dépose une proposition
//
// Pourquoi passer par le serveur plutôt que d'écrire depuis le client :
// le quota. Une règle Firestore ne sait pas compter les documents d'une
// collection, et un compteur rangé dans le doc utilisateur serait
// remis à zéro par le client lui-même. Le comptage se fait donc ici,
// avec l'Admin SDK, et /channelProposals est fermée en écriture côté
// navigateur.
//
// Auth client : header `Authorization: Bearer <idToken>`.
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODES = ['culture', 'tubiscope'];
const FREE_MONTHLY_LIMIT = 2;
const MAX_REASON = 500;

const initAdmin = () => {
  if (getApps().length > 0) return { db: getFirestore(), auth: getAuth() };
  let credential;
  if (process.env.FIREBASE_ADMIN_KEY_JSON) {
    credential = cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY_JSON));
  } else {
    const sa = JSON.parse(readFileSync(join(__dirname, '..', 'firebase-admin-key.json'), 'utf8'));
    credential = cert(sa);
  }
  initializeApp({ credential });
  return { db: getFirestore(), auth: getAuth() };
};

// ---------------------------------------------------------------------
// Le mois courant, à l'heure de Paris.
//
// Un quota « par mois » compté en UTC décalerait la remise à zéro de
// une ou deux heures selon la saison. Personne n'en mourrait, mais le
// message affiché à l'utilisateur (« remis à zéro le 1er ») serait
// faux une nuit par mois.
// ---------------------------------------------------------------------
function parisOffsetMs(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(
    dtf.formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value])
  );
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - date.getTime();
}

function monthWindowParis(now = new Date()) {
  const wall = new Date(now.getTime() + parisOffsetMs(now));
  const y = wall.getUTCFullYear();
  const m = wall.getUTCMonth();
  const startWall = Date.UTC(y, m, 1, 0, 0, 0);
  const nextWall = Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1, 0, 0, 0);
  return {
    start: startWall - parisOffsetMs(new Date(startWall)),
    next: nextWall - parisOffsetMs(new Date(nextWall)),
  };
}

// ---------------------------------------------------------------------
// Vérifie le token. Renvoie { uid, email } ou null (réponse déjà écrite).
// ---------------------------------------------------------------------
async function requireUser(req, res) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/);
  if (!m) {
    res.status(401).json({ success: false, error: 'Connecte-toi pour proposer une chaîne.' });
    return null;
  }
  try {
    const { auth } = initAdmin();
    const decoded = await auth.verifyIdToken(m[1]);
    return { uid: decoded.uid, email: decoded.email || null, admin: !!decoded.admin };
  } catch (e) {
    res.status(401).json({ success: false, error: 'Session expirée, reconnecte-toi.' });
    return null;
  }
}

// ---------------------------------------------------------------------
// Combien de propositions déjà déposées ce mois-ci, et combien il en
// reste. Les abonnés Studio ne sont pas plafonnés.
//
// On ne filtre pas createdAt côté Firestore : ça demanderait un index
// composite (proposedBy + createdAt) pour économiser quelques documents
// par utilisateur. Le tri se fait ici.
// ---------------------------------------------------------------------
async function readQuota(db, uid) {
  const [userSnap, propSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('channelProposals').where('proposedBy', '==', uid).get(),
  ]);

  const isPremium = !!userSnap.data()?.isPremium;
  const { start, next } = monthWindowParis();
  const used = propSnap.docs.filter((d) => Number(d.data()?.createdAt || 0) >= start).length;

  return {
    isPremium,
    limit: isPremium ? null : FREE_MONTHLY_LIMIT,
    used,
    remaining: isPremium ? null : Math.max(0, FREE_MONTHLY_LIMIT - used),
    resetAt: next,
  };
}

export async function quotaHandler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const { db } = initAdmin();
    const quota = await readQuota(db, user.uid);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, ...quota });
  } catch (e) {
    console.error('quota propositions :', e);
    return res.status(500).json({ success: false, error: 'Lecture du quota impossible.' });
  }
}

export async function proposeChannelHandler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  const rawInput = String(req.body?.handle || '').trim();
  const suggestedCategoryId = String(req.body?.suggestedCategoryId || '').trim();
  const reason = String(req.body?.reason || '').trim().slice(0, MAX_REASON);
  const mode = String(req.body?.mode || '').trim();

  if (!rawInput || rawInput.length > 200) {
    return res.status(400).json({ success: false, error: 'Indique le handle ou l’URL de la chaîne.' });
  }
  if (!suggestedCategoryId) {
    return res.status(400).json({ success: false, error: 'Choisis une thématique.' });
  }
  if (!MODES.includes(mode)) {
    return res.status(400).json({ success: false, error: `Mode inconnu : ${mode}` });
  }

  try {
    const { db } = initAdmin();
    const quota = await readQuota(db, user.uid);

    if (!quota.isPremium && quota.remaining <= 0) {
      return res.status(429).json({
        success: false,
        error: `Tu as déjà proposé ${FREE_MONTHLY_LIMIT} chaînes ce mois-ci. Le compteur repart le 1er.`,
        ...quota,
      });
    }

    // Normalisation légère : on retire l'URL et l'arobase, le tri
    // définitif se fait côté admin.
    const handle = rawInput
      .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
      .replace(/^@/, '');

    const now = Date.now();
    await db.collection('channelProposals').add({
      handle,
      rawInput,
      suggestedCategoryId,
      mode,
      reason,
      status: 'pending',
      proposedBy: user.uid,
      proposedByEmail: user.email,
      createdAt: now,
    });

    const used = quota.used + 1;
    return res.status(200).json({
      success: true,
      isPremium: quota.isPremium,
      limit: quota.limit,
      used,
      remaining: quota.isPremium ? null : Math.max(0, FREE_MONTHLY_LIMIT - used),
      resetAt: quota.resetAt,
    });
  } catch (e) {
    console.error('proposition de chaîne :', e);
    return res.status(500).json({ success: false, error: 'Enregistrement impossible, réessaie.' });
  }
}
