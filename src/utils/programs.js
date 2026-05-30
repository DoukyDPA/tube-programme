// =====================================================================
// src/utils/programs.js
// =====================================================================
// Helpers de filtrage et tri appliqués au flux de programmes affiché
// dans les catégories de Tubiscope et Tubiscope Culture.
//
// Règle métier :
//   - Tri par date de publication, du plus récent au plus ancien.
//   - 5 vidéos maximum par chaîne dans une même catégorie, pour éviter
//     qu'une chaîne très active n'écrase toutes les autres.
//
// Cette règle est aussi appliquée côté sync (api/sync.js et
// api/sync-culture.js) afin que la base reste propre. Le cap côté UI
// reste utile pour absorber l'historique déjà stocké et pour rester
// robuste si la logique de sync change un jour.
// =====================================================================

export const MAX_VIDEOS_PER_CHANNEL_IN_CATEGORY = 5;

export function capProgramsPerChannel(
  programs,
  max = MAX_VIDEOS_PER_CHANNEL_IN_CATEGORY,
) {
  if (!Array.isArray(programs) || programs.length === 0) return [];

  // Dédup par youtubeId avant tout. Filet de sécurité contre les
  // doublons résiduels en base (sync interrompus, anciens scripts).
  // On garde le doc le plus récent (createdAt max), ou le premier
  // rencontré si createdAt manque.
  const byYid = new Map();
  for (const p of programs) {
    const key = p.youtubeId || p.id;
    const existing = byYid.get(key);
    if (!existing || (p.createdAt || 0) > (existing.createdAt || 0)) {
      byYid.set(key, p);
    }
  }
  const deduped = Array.from(byYid.values());

  const sorted = deduped.sort(
    (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0),
  );
  const seen = new Map();
  const out = [];
  for (const p of sorted) {
    const cid = p.channelId || 'unknown';
    const n = seen.get(cid) || 0;
    if (n >= max) continue;
    seen.set(cid, n + 1);
    out.push(p);
  }
  return out;
}
