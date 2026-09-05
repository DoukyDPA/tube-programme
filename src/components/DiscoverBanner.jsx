import React, { useState, useEffect } from 'react';
import { Sparkles, X, ExternalLink, Landmark, SlidersHorizontal } from 'lucide-react';
import { MODE_CULTURE, otherModeUrl } from '../data/appMode';

// =====================================================================
// Passerelle entre les deux Tubiscope
// =====================================================================
// tubiscope.fr sert Tubiscope Culture, la sélection éditoriale, lisible
// sans compte. tubiscope.com sert l'espace personnel, où chacun choisit
// ses propres chaînes. Deux domaines, donc deux applications aux yeux du
// navigateur : le passage de l'un à l'autre doit être explicite, sinon
// personne ne découvre l'autre moitié du projet.
//
// Deux surfaces, une par contexte :
//   - ModeSwitchCard : carte permanente dans la barre latérale (écran
//     large). Toujours visible, jamais masquable.
//   - DiscoverBanner : bandeau fin en haut du contenu, réservé au mobile,
//     qui n'a pas de barre latérale. Masquable pour la session.
//
// Le texte décrit ce qu'on va y trouver, pas le nom du produit : « votre
// propre sélection » parle mieux que « Tubiscope Studio » à quelqu'un qui
// découvre.
// =====================================================================

// Contenu commun aux deux surfaces.
function copyFor(mode) {
  const isOnCulture = mode === MODE_CULTURE;
  return {
    target: otherModeUrl(mode),
    isOnCulture,
    title: isOnCulture ? 'Votre propre sélection' : 'Tubiscope Culture',
    short: isOnCulture ? 'Vos chaînes à vous' : 'La sélection culture',
    desc: isOnCulture
      ? 'Suivez vos propres chaînes YouTube, rangées dans vos thématiques.'
      : '120 chaînes culturelles choisies, en 11 thématiques. Sans compte.',
    cta: isOnCulture ? 'Ouvrir Tubiscope' : 'Voir Tubiscope Culture',
  };
}

// Carte permanente pour la barre latérale, écrans larges.
export function ModeSwitchCard({ mode }) {
  const { target, isOnCulture, title, desc, cta } = copyFor(mode);
  const Icon = isOnCulture ? SlidersHorizontal : Landmark;

  // La couleur annonce la destination : indigo pour Tubiscope, fuchsia
  // pour Culture.
  const accent = isOnCulture
    ? {
        box: 'from-indigo-600/15 to-slate-900/40 border-indigo-500/25 hover:border-indigo-500/50',
        icon: 'bg-indigo-500/15 text-indigo-300',
        cta: 'text-indigo-300',
      }
    : {
        box: 'from-fuchsia-600/15 to-slate-900/40 border-fuchsia-500/25 hover:border-fuchsia-500/50',
        icon: 'bg-fuchsia-500/15 text-fuchsia-300',
        cta: 'text-fuchsia-300',
      };

  return (
    <a
      href={target}
      target="_blank"
      rel="noopener noreferrer"
      className={`hidden md:block mx-4 mt-6 p-4 rounded-2xl bg-gradient-to-br border transition-colors ${accent.box}`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accent.icon}`}>
          <Icon size={16} />
        </span>
        <span className="text-sm font-bold text-white leading-tight">{title}</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed mb-2">{desc}</p>
      <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${accent.cta}`}>
        {cta}
        <ExternalLink size={11} />
      </span>
    </a>
  );
}

// Bandeau mobile. La barre latérale n'existe pas sous md, c'est donc la
// seule passerelle visible sur téléphone.
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

  const { target, short, cta } = copyFor(mode);

  return (
    <div className="md:hidden bg-gradient-to-r from-indigo-600/15 via-fuchsia-600/15 to-emerald-600/15 border-b border-indigo-500/20">
      <div className="px-4 py-2.5 flex items-center gap-3">
        <Sparkles size={15} className="text-indigo-400 shrink-0" />
        <span className="text-sm font-bold text-white flex-1 min-w-0 truncate">{short}</span>
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
