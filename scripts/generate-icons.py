#!/usr/bin/env python3
# =====================================================================
# scripts/generate-icons.py
# =====================================================================
# Fabrique les icônes de l'application à partir de la marque Tubiscope.
#
# La géométrie est copiée à l'identique de src/components/TubiscopeMark.jsx
# et de public/logo-mark.svg : si tu modifies la marque, modifie les trois.
# Le dessin est fait à la main plutôt que par un moteur SVG, pour ne
# dépendre d'aucun outil de rendu et garantir le même résultat partout.
#
# Usage : python3 scripts/generate-icons.py
# Dépendance : Pillow.
# =====================================================================

from PIL import Image, ImageDraw
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PUBLIC = RACINE / 'public'

FOND = (10, 15, 28)         # #0a0f1c, le fond de l'application
INDIGO = (99, 102, 241)     # #6366f1, Tubiscope
FUCHSIA = (232, 121, 249)   # #e879f9, Tubiscope Culture

SS = 8  # suréchantillonnage


def dessine(taille, encre, fond=FOND, occupation=0.72):
    """La marque centrée sur un carré. `occupation` est la part du côté
    occupée par le diamètre du disque."""
    S = taille * SS
    img = Image.new('RGB', (S, S), fond)
    d = ImageDraw.Draw(img)

    # Repère de la marque : un carré de 512 ramené à l'échelle voulue.
    d_disque = S * occupation
    k = d_disque / 464.0          # 464 = diamètre dans le repère 512
    ox = oy = (S - 512 * k) / 2   # origine du repère

    def X(v): return ox + v * k
    def Y(v): return oy + v * k

    d.ellipse([X(24), Y(24), X(488), Y(488)], fill=encre)

    # Les fentes, dans l'ordre du composant React.
    for x, y, w, h in [
        (240, 0, 32, 200),      # fente verticale de la moitié haute
        (0, 168, 512, 32),      # au-dessus de la barre
        (0, 284, 206, 32),      # sous la barre, à gauche du pied
        (306, 284, 206, 32),    # sous la barre, à droite du pied
        (174, 284, 32, 228),    # flanc gauche du pied
        (306, 284, 32, 228),    # flanc droit du pied
    ]:
        d.rectangle([X(x), Y(y), X(x + w), Y(y + h)], fill=fond)

    return img.resize((taille, taille), Image.LANCZOS)


A_PRODUIRE = [
    # (fichier, taille, encre, occupation)
    ('icon-192.png', 192, INDIGO, 0.72),
    ('icon-512.png', 512, INDIGO, 0.72),
    ('logo-192.png', 192, INDIGO, 0.72),
    ('logo-512.png', 512, INDIGO, 0.72),
    # Masquable : Android rogne jusqu'à un cercle de 80 % du côté, la
    # marque doit tenir largement dedans.
    ('icon-maskable-512.png', 512, INDIGO, 0.56),
    # Onglet du navigateur : la marque prend presque tout le carré, sinon
    # elle n'est plus lisible.
    ('favicon-32.png', 32, INDIGO, 0.88),
    # Vignette de partage de la page publique.
    ('icon-culture-512.png', 512, FUCHSIA, 0.72),
]

if __name__ == '__main__':
    for nom, taille, encre, occ in A_PRODUIRE:
        img = dessine(taille, encre, occupation=occ)
        img.save(PUBLIC / nom, optimize=True)
        print(f'{nom:26} {taille:4} px')
    print(f'\n{len(A_PRODUIRE)} fichiers écrits dans {PUBLIC}')
