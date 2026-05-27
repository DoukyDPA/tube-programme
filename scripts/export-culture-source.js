// =====================================================================
// scripts/export-culture-source.js
// =====================================================================
// Exporte CULTURE_THEMES + CULTURE_CHANNELS de src/data/cultureChannels.js
// vers public/culture-channels-source.json, pour que la page
// admin-channels.html puisse importer la liste depuis le navigateur.
//
// Usage :
//   node scripts/export-culture-source.js
// =====================================================================

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  CULTURE_THEMES,
  CULTURE_CHANNELS,
} from '../src/data/cultureChannels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const payload = {
  themes: CULTURE_THEMES,
  channels: CULTURE_CHANNELS,
  total: Object.values(CULTURE_CHANNELS).reduce((n, arr) => n + arr.length, 0),
  generatedAt: Date.now(),
};

const outPath = join(__dirname, '..', 'public', 'culture-channels-source.json');
writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`culture-channels-source.json généré (${payload.total} chaînes) -> ${outPath}`);
