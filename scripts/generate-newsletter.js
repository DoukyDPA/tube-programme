// =====================================================================
// scripts/generate-newsletter.js
// =====================================================================
// Génère un numéro hebdo de la newsletter Tubiscope Culture.
//
// Stratégie :
//   - Pour chaque thématique cult_xxx, on lit les 5 vidéos les plus
//     récentes dans Firestore (scopes/{themeId}/programs).
//   - On retient les thématiques qui ont au moins une vidéo publiée
//     depuis moins de WINDOW_DAYS jours.
//   - On en sélectionne MAX_PICKS (par défaut 5), en privilégiant les
//     thématiques avec la vidéo la plus récente.
//   - Pour chaque pick, on génère un JSON exploitable + un HTML.
//
// Usage CLI :
//   node scripts/generate-newsletter.js              # numéro de la semaine en cours
//   node scripts/generate-newsletter.js --max=5      # forcer le nombre de picks
//   node scripts/generate-newsletter.js --window=10  # élargir la fenêtre à 10 jours
//
// Usage programmatique (depuis /api/generate-newsletter) :
//   import { generateNewsletter } from './scripts/generate-newsletter.js';
//   const { issue, html } = await generateNewsletter({ maxPicks: 5, windowDays: 7 });
//
// Les accroches éditoriales sont laissées vides dans le JSON et un
// placeholder est inséré dans le HTML. À toi de les rédiger avant envoi.
// =====================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { CULTURE_THEMES } from '../src/data/cultureChannels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---- Init Firebase Admin (idempotent) ----
const initAdmin = () => {
  if (getApps().length > 0) return getFirestore();
  let credential;
  if (process.env.FIREBASE_ADMIN_KEY_JSON) {
    credential = cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY_JSON));
  } else {
    const keyPath = join(__dirname, '..', 'firebase-admin-key.json');
    const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
    credential = cert(sa);
  }
  initializeApp({ credential });
  return getFirestore();
};

// ---- Génération du HTML ----
const STYLES = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f1a;color:#e8e8f0;line-height:1.6;padding:32px 16px}
    .container{max-width:640px;margin:0 auto;background:#161626;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
    .header{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:36px 32px 28px}
    .header .logo{display:inline-flex;align-items:center;gap:10px;color:#fff;font-weight:700;font-size:18px;letter-spacing:-.3px}
    .header .logo-icon{width:32px;height:32px;background:rgba(255,255,255,.15);border-radius:8px;display:inline-flex;align-items:center;justify-content:center}
    .header h1{color:#fff;font-size:28px;font-weight:700;margin-top:18px;letter-spacing:-.6px;line-height:1.25}
    .header .meta{color:rgba(255,255,255,.75);font-size:13px;margin-top:8px;text-transform:uppercase;letter-spacing:.8px}
    .intro{padding:28px 32px 8px;color:#c8c8d8;font-size:15.5px}
    .pick{padding:24px 32px;border-top:1px solid rgba(255,255,255,.06)}
    .pick:first-of-type{border-top:none}
    .pick .theme{display:inline-block;background:rgba(124,58,237,.15);color:#b4a5ff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px}
    .pick a.thumb{display:block;width:100%;border-radius:10px;overflow:hidden;position:relative;aspect-ratio:16/9;background:#000}
    .pick a.thumb img{width:100%;height:100%;object-fit:cover;display:block}
    .pick a.thumb .play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56px;height:56px;border-radius:50%;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center}
    .pick a.thumb .play::after{content:'';width:0;height:0;border-left:16px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:4px}
    .pick h2{color:#fff;font-size:20px;font-weight:700;margin-top:14px;line-height:1.3;letter-spacing:-.3px}
    .pick h2 a{color:inherit;text-decoration:none}
    .pick .creator{color:#8a8aa0;font-size:14px;margin-top:6px}
    .pick .creator strong{color:#c0c0d0;font-weight:600}
    .pick .blurb{color:#d4d4e0;font-size:15px;margin-top:12px}
    .pick .cta{display:inline-block;margin-top:14px;color:#a78bfa;font-size:14px;font-weight:600;text-decoration:none}
    .footer{background:linear-gradient(180deg,#161626 0%,#0f0f1a 100%);padding:36px 32px;text-align:center;border-top:1px solid rgba(255,255,255,.06)}
    .footer h3{color:#fff;font-size:18px;font-weight:700;margin-bottom:10px;letter-spacing:-.3px}
    .footer p{color:#a0a0b8;font-size:14.5px;margin-bottom:20px;max-width:420px;margin-left:auto;margin-right:auto}
    .btn{display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;padding:12px 28px;border-radius:10px;font-weight:600;font-size:15px;text-decoration:none;box-shadow:0 6px 20px rgba(79,70,229,.35)}
`;

const renderPick = (p) => `
    <article class="pick">
      <span class="theme">${p.themeLabel}</span>
      <a class="thumb" href="${p.url}">
        <img src="${p.thumb}" alt="" />
        <span class="play"></span>
      </a>
      <h2><a href="${p.url}">${p.title}</a></h2>
      <div class="creator"><strong>${p.creatorName}</strong> · publié le ${p.publishedPretty}</div>
      <p class="blurb">${p.blurb || '<em style="color:#7a7a92">[à rédiger : 2-3 phrases d&rsquo;accroche éditoriale]</em>'}</p>
      <a class="cta" href="${p.url}">Regarder sur YouTube →</a>
    </article>
`;

const renderHtml = (issue) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tubiscope — Le coup d'œil de la semaine · ${issue.issuePretty}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="logo">
        <span class="logo-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="white"><polygon points="10 8 16 12 10 16 10 8"/></svg></span>
        Tubiscope
      </div>
      <h1>Le coup d'œil de la semaine</h1>
      <div class="meta">${issue.issuePretty}</div>
    </header>
    <section class="intro">
      <p>Les vidéos repérées cette semaine sur les chaînes recensées par le ministère de la Culture. Une par thème, pas plus.</p>
    </section>
    ${issue.picks.map(renderPick).join('')}
    <footer class="footer">
      <h3>Tu veux voir tout le reste ?</h3>
      <p>Tubiscope recense 350+ chaînes culturelles sélectionnées par le ministère, classées par thématiques. Visionnage sans algorithme.</p>
      <a class="btn" href="https://tubiscope.fr">Découvrir Tubiscope</a>
    </footer>
  </div>
</body>
</html>
`;

// ---------------------------------------------------------------------
// Fonction exportée : génère un numéro et retourne {issue, html}.
// N'écrit AUCUN fichier. Utilisable depuis l'API ou un script CLI.
// ---------------------------------------------------------------------
export async function generateNewsletter({ maxPicks = 5, windowDays = 7 } = {}) {
  const db = initAdmin();
  const since = Date.now() - windowDays * 24 * 3600 * 1000;

  const themeBest = [];
  for (const theme of CULTURE_THEMES) {
    const snap = await db
      .collection('scopes')
      .doc(theme.id)
      .collection('programs')
      .orderBy('publishedAt', 'desc')
      .limit(5)
      .get();

    const recent = snap.docs
      .map((d) => d.data())
      .filter((v) => v.publishedAt >= since);
    if (recent.length === 0) continue;
    const best = recent[0];
    themeBest.push({
      themeId: theme.id,
      themeLabel: theme.label,
      youtubeId: best.youtubeId,
      title: best.title,
      creatorName: best.creatorName,
      publishedAt: best.publishedAt,
    });
  }

  themeBest.sort((a, b) => b.publishedAt - a.publishedAt);
  const picks = themeBest.slice(0, maxPicks);

  if (picks.length === 0) {
    throw new Error(
      `Aucune vidéo récente trouvée (fenêtre ${windowDays}j). Lance d'abord sync-culture.`
    );
  }

  const today = new Date();
  const issueDate = today.toISOString().slice(0, 10);
  const issuePretty = today.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const issue = {
    issueDate,
    issuePretty,
    windowDays,
    maxPicks,
    activeThemes: themeBest.length,
    picks: picks.map((p) => ({
      themeId: p.themeId,
      themeLabel: p.themeLabel,
      youtubeId: p.youtubeId,
      title: p.title,
      creatorName: p.creatorName,
      publishedAt: p.publishedAt,
      publishedPretty: new Date(p.publishedAt).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
      }),
      url: `https://www.youtube.com/watch?v=${p.youtubeId}`,
      thumb: `https://i.ytimg.com/vi/${p.youtubeId}/hqdefault.jpg`,
      blurb: '',
    })),
  };

  const html = renderHtml(issue);
  return { issue, html };
}

// ---------------------------------------------------------------------
// Mode CLI : exécuté si le fichier est lancé directement avec `node`.
// Écrit le JSON et le HTML dans le dossier newsletter/.
// ---------------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--(\w+)=?(.*)$/);
      return m ? [m[1], m[2] || true] : [a, true];
    })
  );
  const maxPicks = parseInt(args.max || '5', 10);
  const windowDays = parseInt(args.window || '7', 10);

  try {
    const { issue, html } = await generateNewsletter({ maxPicks, windowDays });

    const outDir = join(__dirname, '..', 'newsletter');
    mkdirSync(outDir, { recursive: true });
    const jsonPath = join(outDir, `${issue.issueDate}.json`);
    const htmlPath = join(outDir, `${issue.issueDate}.html`);
    writeFileSync(jsonPath, JSON.stringify(issue, null, 2));
    writeFileSync(htmlPath, html);

    console.log(`\nNuméro généré : ${issue.issueDate}`);
    console.log(`  JSON : ${jsonPath}`);
    console.log(`  HTML : ${htmlPath}`);
    console.log(
      `  ${issue.picks.length} pick(s) sur ${issue.activeThemes} thématique(s) actives dans la fenêtre ${windowDays}j.\n`
    );
    for (const p of issue.picks) {
      console.log(`  · [${p.themeLabel}] ${p.creatorName} — ${p.title}`);
    }
    console.log('\nPensez à rédiger les accroches dans le JSON puis régénérer le HTML.');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
