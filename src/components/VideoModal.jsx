import React, { useState } from 'react';
import { X, Share2, Check, Copy } from 'lucide-react';
import useBackButtonClose from '../hooks/useBackButtonClose';

export default function VideoModal({ prog, onClose }) {
  // Bouton Précédent du navigateur = ferme la modale au lieu de quitter
  // l'app. Échap aussi. Cf. src/hooks/useBackButtonClose.js.
  useBackButtonClose(!!prog, onClose, 'video');

  // État du partage : 'idle', 'copied' (le presse-papier vient d'être
  // alimenté), 'shared' (l'API Web Share a réussi). Affiche un retour
  // visuel pour confirmer à l'utilisateur que l'action a fonctionné.
  const [shareState, setShareState] = useState('idle');

  if (!prog) return null;

  // -----------------------------------------------------------------
  // Construit l'URL à partager : domaine actuel + paramètres UTM pour
  // mesurer les conversions amenées par le partage utilisateur. Le
  // paramètre `v` transporte l'id YouTube : tu peux, plus tard, ouvrir
  // automatiquement la vidéo concernée à l'arrivée du visiteur.
  // -----------------------------------------------------------------
  const buildShareUrl = () => {
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://tubiscope.fr';
    const params = new URLSearchParams({
      utm_source: 'share',
      utm_medium: 'user',
      v: prog.youtubeId,
    });
    return `${origin}/?${params.toString()}`;
  };

  const handleShare = async () => {
    const url = buildShareUrl();
    const title = `${prog.title} — Tubiscope Culture`;
    const text = `Je viens de découvrir cette vidéo sur Tubiscope Culture, ça pourrait te plaire : ${prog.title}`;

    // 1. Web Share API (mobile principalement, Chrome/Edge desktop aussi)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        setShareState('shared');
        setTimeout(() => setShareState('idle'), 2500);
        return;
      } catch (e) {
        // L'utilisateur a annulé le partage, ou l'API a échoué. On
        // tente le fallback presse-papier dans le cas d'une vraie erreur.
        if (e?.name === 'AbortError') return;
      }
    }

    // 2. Fallback : copie dans le presse-papier
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2500);
    } catch {
      // Dernier recours : prompt manuel
      window.prompt('Copiez ce lien pour partager :', url);
    }
  };

  const shareLabel =
    shareState === 'copied'
      ? 'Lien copié'
      : shareState === 'shared'
      ? 'Partagé'
      : 'Partager';

  const ShareIcon =
    shareState === 'copied' ? Copy : shareState === 'shared' ? Check : Share2;

  return (
    <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-sm flex flex-col md:flex-row items-center justify-center p-0 md:p-10">
      <button onClick={onClose} className="absolute top-6 right-6 md:top-10 md:right-10 text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-all z-50 backdrop-blur-md">
        <X size={24} />
      </button>

      <div className="w-full h-[30vh] md:h-[80vh] md:w-[70vw] bg-black md:rounded-2xl overflow-hidden shadow-2xl flex-shrink-0">
        <iframe
          width="100%" height="100%"
          src={`https://www.youtube.com/embed/${prog.youtubeId}?autoplay=1`}
          frameBorder="0" allowFullScreen title="YouTube"
        />
      </div>

      <div className="w-full flex-1 p-6 md:p-10 text-left overflow-y-auto">
        <span className="text-indigo-400 font-bold text-xs uppercase tracking-widest bg-indigo-500/10 px-3 py-1.5 rounded-full mb-4 inline-block">
          {prog.creatorName}
        </span>
        <h2 className="text-2xl md:text-4xl font-bold text-white leading-tight mb-6">{prog.title}</h2>

        {/* Actions : YouTube + Partager */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://www.youtube.com/watch?v=${prog.youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-semibold transition-colors"
          >
            Regarder sur YouTube
          </a>
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-fuchsia-500/20"
            title="Partager cette vidéo avec un ami"
          >
            <ShareIcon size={16} />
            {shareLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
