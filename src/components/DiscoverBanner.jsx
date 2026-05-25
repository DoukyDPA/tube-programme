import React, { useState, useEffect } from 'react';
import { Sparkles, X, ExternalLink } from 'lucide-react';
import { MODE_CULTURE, otherModeUrl } from '../data/appMode';

// Bandeau permanent qui invite à découvrir l'autre version de Tubiscope.
// Sur tubiscope.com on pointe vers Culture, sur tubiscope.fr on pointe vers
// Studio / Tubiscope. L'utilisateur peut le masquer pour la session courante.
export default function DiscoverBanner({ mode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const flag = sessionStorage.getItem('tubiscope:bannerHidden');
      if (flag === '1') setHidden(true);
    } catch {
      /* noop */
    }
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem('tubiscope:bannerHidden', '1');
    } catch {
      /* noop */
    }
  };

  if (hidden) return null;

  const isOnCulture = mode === MODE_CULTURE;
  const target = otherModeUrl(mode);

  const title = isOnCulture
    ? 'Envie de personnaliser vos chaînes ?'
    : 'Tu connais Tubiscope Culture ?';

  const desc = isOnCulture
    ? 'Sur tubiscope.com, sélectionnez vos propres chaînes par thématique. Version gratuite ou Studio.'
    : '19 thématiques, 350 chaînes validées par le ministère de la Culture. Gratuit.';

  const cta = isOnCulture ? 'Voir Tubiscope' : 'Voir Tubiscope Culture';

  return (
    <div className="bg-gradient-to-r from-indigo-600/15 via-fuchsia-600/15 to-emerald-600/15 border-b border-indigo-500/20">
      <div className="max-w-7xl mx-auto px-4 md:px-10 py-2.5 flex items-center gap-4">
        <Sparkles size={16} className="text-indigo-400 shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center md:gap-3">
          <span className="text-sm font-bold text-white truncate">{title}</span>
          <span className="text-xs text-slate-300 truncate hidden md:block">{desc}</span>
        </div>
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          {cta}
          <ExternalLink size={12} />
        </a>
        <button
          onClick={dismiss}
          className="p-1 text-slate-400 hover:text-white shrink-0"
          aria-label="Masquer le bandeau"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
