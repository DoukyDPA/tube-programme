// =====================================================================
// scripts/set-admin.js
// =====================================================================
// Pose ou retire le custom claim `admin: true` sur un compte Firebase.
//
// Usage :
//   node scripts/set-admin.js <UID|email> [--remove]
//
// Exemples :
//   node scripts/set-admin.js daniel.p.angelini@gmail.com
//   node scripts/set-admin.js daniel.p.angelini@gmail.com --remove
//   node scripts/set-admin.js abc123XYZ
//
// Après exécution, l'utilisateur concerné doit se DÉCONNECTER puis
// se RECONNECTER pour que le nouveau token contienne le claim mis à jour.
// =====================================================================

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charge la clé de service
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-admin-key.json'), 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });

const [, , identifier, flag] = process.argv;
const remove = flag === '--remove';

if (!identifier) {
  console.error('Usage : node scripts/set-admin.js <UID|email> [--remove]');
  process.exit(1);
}

const isEmail = identifier.includes('@');

try {
  // Résout le user à partir d'un email ou d'un UID
  const user = isEmail
    ? await getAuth().getUserByEmail(identifier)
    : await getAuth().getUser(identifier);

  // Pose ou retire le claim
  await getAuth().setCustomUserClaims(user.uid, remove ? null : { admin: true });

  const verifyUser = await getAuth().getUser(user.uid);
  const claims = verifyUser.customClaims || {};

  console.log('');
  console.log('====================================================');
  console.log(`  Compte : ${user.email}`);
  console.log(`  UID    : ${user.uid}`);
  console.log(`  Claims : ${JSON.stringify(claims)}`);
  console.log(`  Statut : ${claims.admin ? 'ADMIN' : 'utilisateur standard'}`);
  console.log('====================================================');
  console.log('');
  console.log("IMPORTANT : déconnecte-toi et reconnecte-toi dans l'app");
  console.log('pour que le nouveau token soit pris en compte.');
  console.log('');

  process.exit(0);
} catch (err) {
  console.error('Erreur :', err.message);
  process.exit(1);
}
