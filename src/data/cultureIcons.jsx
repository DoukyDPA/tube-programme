// =====================================================================
// src/data/cultureIcons.jsx
// =====================================================================
// Mapping themeId -> icône Lucide, dans le même esprit graphique que les
// icônes du Tubiscope standard (lignes blanches/grises, pas d'emoji).
//
// Utilisation :
//   import { CultureIcon } from '../data/cultureIcons';
//   <CultureIcon themeId="cult_lettres" size={18} />
// =====================================================================

import React from 'react';
import {
  BookOpen,
  Languages,
  ScrollText,
  Globe,
  Scale,
  Brain,
  Coins,
  Sigma,
  Atom,
  Dna,
  Cpu,
  Palette,
  Music,
  Clapperboard,
  Trophy,
  Microscope,
  HeartPulse,
  GraduationCap,
  Baby,
  Sparkles,
} from 'lucide-react';

// Composant Lucide par thématique
const ICON_COMPONENTS = {
  cult_lettres: BookOpen,
  cult_langues: Languages,
  cult_histoire: ScrollText,
  cult_geog: Globe,
  cult_societe: Scale,
  cult_sciences: Brain,
  cult_eco: Coins,
  cult_math: Sigma,
  cult_physique: Atom,
  cult_bio: Dna,
  cult_tech: Cpu,
  cult_art: Palette,
  cult_musique: Music,
  cult_audiovisuel: Clapperboard,
  cult_sport: Trophy,
  cult_recherche: Microscope,
  cult_psycho: HeartPulse,
  cult_apprentissage: GraduationCap,
  cult_enfants: Baby,
};

export function CultureIcon({ themeId, size = 18, className = '' }) {
  const Cmp = ICON_COMPONENTS[themeId] || Sparkles;
  return <Cmp size={size} className={className} />;
}

export default ICON_COMPONENTS;
