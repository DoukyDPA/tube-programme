import React from 'react';
import ProgramCard from './ProgramCard';

// Grille responsive multi-lignes utilisée sur la page détail d'une
// rubrique. Toutes les vidéos sont visibles d'un coup, plus de
// défilement horizontal. L'Accueil reste en mode carousel via
// ProgramRow, pour garder l'ambiance Netflix.
export default function ProgramGrid({
  programs,
  onSelect,
  onRemove,
  currentUser,
  isAdmin,
  toggleWatchLater,
  watchLaterList = [],
}) {
  if (!programs || programs.length === 0) return null;

  // Dédup au rendu, comme dans ProgramRow, pour ne jamais montrer
  // deux fois la même vidéo même si la couche en amont laisse passer
  // un résidu.
  const seenYid = new Set();
  const unique = [];
  for (const p of programs) {
    const key = p.youtubeId || p.id;
    if (seenYid.has(key)) continue;
    seenYid.add(key);
    unique.push(p);
  }

  return (
    <div className="px-4 md:px-0 mb-10">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
        {unique.map((prog) => (
          <ProgramCard
            key={prog.youtubeId || prog.id}
            prog={prog}
            grid
            onSelect={onSelect}
            onRemove={onRemove}
            currentUser={currentUser}
            isAdmin={isAdmin}
            toggleWatchLater={toggleWatchLater}
            isWatchLater={watchLaterList.includes(prog.youtubeId)}
          />
        ))}
      </div>
    </div>
  );
}
