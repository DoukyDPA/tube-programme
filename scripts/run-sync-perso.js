// =====================================================================
// scripts/run-sync-perso.js
// =====================================================================
// Déclenche la synchro des thèmes perso à la main, en local, sans passer
// par l'endpoint HTTP ni le cron. Utile pour tester.
//
// Le handler s'authentifie via firebase-admin-key.json (ou
// FIREBASE_ADMIN_KEY_JSON) : il écrit donc dans le Firestore de PROD,
// exactement comme le fera le cron. Recharge l'app après coup pour voir
// les nouvelles vidéos.
//
// Usage :  node scripts/run-sync-perso.js
// =====================================================================

import 'dotenv/config';
import handler from '../api/sync-perso.js';

// req={} sans .get -> tracé comme 'cron'. res absent -> le handler
// retourne le payload au lieu d'écrire dans une réponse HTTP.
handler({}, null)
  .then((result) => {
    console.log('\n=== Résultat sync-perso ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Échec sync-perso :', err);
    process.exit(1);
  });
