import React from 'react';

// =====================================================================
// Marque Tubiscope
// =====================================================================
// Un disque, creusé de fentes qui dessinent une grille et, dans la
// matière, un T. Trois lectures pour une seule forme : l'objectif qui
// observe, la grille de programmes, l'initiale.
//
// Géométrie, dans un carré de 512 :
//   disque      : centre 256, rayon 232, soit un diamètre de 464
//   fentes      : 32, c'est-à-dire 6,9 % du diamètre. C'est la mesure
//                 qui compte : en dessous de 6 %, elles se bouchent à
//                 24 pixels et le disque redevient une masse floue.
//   barre du T  : 84 de haut, centrée à 242 et non à 256. Le pied ajoute
//                 de la masse en bas, remonter la barre rétablit
//                 l'équilibre optique.
//   pied du T   : 100 de large. Volontairement plus épais que la barre :
//                 à épaisseur égale, une horizontale paraît toujours
//                 plus lourde qu'une verticale.
//
// Le tracé se fait par masque plutôt que par découpe peinte du fond :
// la marque reste ainsi utilisable sur n'importe quel fond, et
// currentColor la rend monochrome par héritage.
// =====================================================================

let compteur = 0;

export default function TubiscopeMark({ className = '', title, ...rest }) {
  // Un identifiant unique par instance : deux masques de même nom sur
  // une page se marchent dessus.
  const id = React.useMemo(() => `tubiscope-mark-${++compteur}`, []);

  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : 'true'}
      {...rest}
    >
      {title && <title>{title}</title>}
      <mask id={id}>
        <circle cx="256" cy="256" r="232" fill="#fff" />
        {/* fente verticale de la moitié haute */}
        <rect x="240" y="0" width="32" height="200" fill="#000" />
        {/* fente au-dessus de la barre */}
        <rect x="0" y="168" width="512" height="32" fill="#000" />
        {/* fentes sous la barre, de part et d'autre du pied */}
        <rect x="0" y="284" width="206" height="32" fill="#000" />
        <rect x="306" y="284" width="206" height="32" fill="#000" />
        {/* fentes verticales encadrant le pied */}
        <rect x="174" y="284" width="32" height="228" fill="#000" />
        <rect x="306" y="284" width="32" height="228" fill="#000" />
      </mask>
      <circle cx="256" cy="256" r="232" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
