// =====================================================================
// api/admin-users.js
// =====================================================================
// Endpoints d'administration des utilisateurs Tubiscope.
//
// Toutes les routes vérifient le token Firebase et le claim `admin: true`.
//
//   GET    /api/admin/users            : liste tous les comptes (Auth + Firestore)
//   POST   /api/admin/users/:uid/studio: toggle isPremium (body { isPremium: bool })
//   DELETE /api/admin/users/:uid       : supprime Auth + doc Firestore + sous-collections
//
// Auth client : header `Authorization: Bearer <idToken>`.
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Init Admin SDK une fois pour l'instance Node
const initAdmin = () => {
  if (getApps().length > 0) {
    return { db: getFirestore(), auth: getAuth() };
  }
  let credential;
  if (process.env.FIREBASE_ADMIN_KEY_JSON) {
    credential = cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY_JSON));
  } else {
    const keyPath = join(__dirname, '..', 'firebase-admin-key.json');
    const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
    credential = cert(sa);
  }
  initializeApp({ credential });
  return { db: getFirestore(), auth: getAuth() };
};

// ---------------------------------------------------------------------
// Middleware : vérifie le token et le claim admin.
// Renvoie le decodedToken si OK, sinon écrit la réponse d'erreur.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// GET /api/admin/users : liste fusionnée Auth + Firestore.
// ---------------------------------------------------------------------
export async function listUsersHandler(req, res) {
  const decoded = await requireAdmin(req, res);
  if (!decoded) return;

  try {
    const { auth, db } = initAdmin();

    // 1. Liste tous les comptes Auth (pagine si > 1000)
    const authUsers = [];
    let pageToken;
    do {
      const page = await auth.listUsers(1000, pageToken);
      authUsers.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);

    // 2. Charge tous les docs Firestore users en une lecture
    const fsSnap = await db.collection('users').get();
    const fsMap = new Map();
    fsSnap.forEach(d => fsMap.set(d.id, d.data()));

    // 3. Merge
    const merged = authUsers.map(u => {
      const fs = fsMap.get(u.uid) || {};
      return {
        uid: u.uid,
        email: u.email || null,
        displayName: u.displayName || null,
        emailVerified: !!u.emailVerified,
        disabled: !!u.disabled,
        createdAt: u.metadata?.creationTime
          ? new Date(u.metadata.creationTime).getTime()
          : null,
        lastSignInAt: u.metadata?.lastSignInTime
          ? new Date(u.metadata.lastSignInTime).getTime()
          : null,
        isAdmin: !!(u.customClaims && u.customClaims.admin),
        isPremium: !!fs.isPremium,
        themeCount: fs.themeCount || 0,
        watchLaterCount: Array.isArray(fs.watchLater) ? fs.watchLater.length : 0,
        hasFirestoreDoc: fsMap.has(u.uid),
      };
    });

    // Tri : Studio d'abord, puis date de création décroissante
    merged.sort((a, b) => {
      if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    res.json({ success: true, users: merged, total: merged.length });
  } catch (e) {
    console.error('Erreur listUsers:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}

// ---------------------------------------------------------------------
// POST /api/admin/users/:uid/studio  body { isPremium: boolean }
// ---------------------------------------------------------------------
export async function toggleStudioHandler(req, res) {
  const decoded = await requireAdmin(req, res);
  if (!decoded) return;

  const { uid } = req.params;
  const { isPremium } = req.body || {};

  if (typeof isPremium !== 'boolean') {
    return res.status(400).json({ success: false, error: 'isPremium (boolean) requis.' });
  }

  try {
    const { db, auth } = initAdmin();
    // Garde-fou : vérifie que le compte Auth existe
    await auth.getUser(uid);

    await db.collection('users').doc(uid).set(
      { isPremium, premiumUpdatedAt: Date.now(), premiumUpdatedBy: decoded.uid },
      { merge: true }
    );

    // Traçabilité : log d'audit immuable (écrit via Admin SDK, non falsifiable côté client)
    await db.collection('auditLogs').add({
      action: 'toggle_studio',
      targetUid: uid,
      performedBy: decoded.uid,
      performedAt: FieldValue.serverTimestamp(),
      meta: { isPremium },
    });

    res.json({ success: true, uid, isPremium });
  } catch (e) {
    console.error('Erreur toggleStudio:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}

// ---------------------------------------------------------------------
// DELETE /api/admin/users/:uid
// Supprime Auth + doc Firestore users/{uid} + sous-collections themes
// (et leurs sous-sous-collections programs).
// ---------------------------------------------------------------------
export async function deleteUserHandler(req, res) {
  const decoded = await requireAdmin(req, res);
  if (!decoded) return;

  const { uid } = req.params;

  // Garde-fou : un admin ne peut pas supprimer son propre compte par cette voie
  if (uid === decoded.uid) {
    return res.status(400).json({
      success: false,
      error: "Tu ne peux pas supprimer ton propre compte via cet endpoint."
    });
  }

  try {
    const { db, auth } = initAdmin();

    // 1. Purge récursive : themes/{themeId}/programs puis themes
    const themesRef = db.collection('users').doc(uid).collection('themes');
    const themes = await themesRef.get();
    let deletedThemes = 0;
    let deletedPrograms = 0;

    for (const t of themes.docs) {
      const progs = await t.ref.collection('programs').get();
      for (let i = 0; i < progs.docs.length; i += 400) {
        const batch = db.batch();
        progs.docs.slice(i, i + 400).forEach(p => batch.delete(p.ref));
        await batch.commit();
        deletedPrograms += Math.min(400, progs.docs.length - i);
      }
      await t.ref.delete();
      deletedThemes++;
    }

    // 2. Doc principal
    let firestoreDocDeleted = false;
    try {
      await db.collection('users').doc(uid).delete();
      firestoreDocDeleted = true;
    } catch (e) {
      // Si le doc n'existe pas, on ignore.
    }

    // 3. Compte Firebase Auth
    let authDeleted = false;
    try {
      await auth.deleteUser(uid);
      authDeleted = true;
    } catch (e) {
      // Si le compte n'existe pas côté Auth, on continue silencieusement.
      if (e.code !== 'auth/user-not-found') throw e;
    }

    // Traçabilité : log d'audit immuable (écrit via Admin SDK, non falsifiable côté client)
    await db.collection('auditLogs').add({
      action: 'delete_user',
      targetUid: uid,
      performedBy: decoded.uid,
      performedAt: FieldValue.serverTimestamp(),
      meta: { authDeleted, firestoreDocDeleted, deletedThemes, deletedPrograms },
    });

    res.json({
      success: true,
      uid,
      authDeleted,
      firestoreDocDeleted,
      deletedThemes,
      deletedPrograms,
    });
  } catch (e) {
    console.error('Erreur deleteUser:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}
