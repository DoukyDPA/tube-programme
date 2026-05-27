// =====================================================================
// src/data/categoryIcons.jsx
// =====================================================================
// Mapping clé string -> composant React (Lucide).
// /categories stocke icon comme une string (cpu, book, trophy, ...).
// On résout ici vers le bon composant pour l'affichage.
// =====================================================================

import React from 'react';
import {
  Cpu, BookOpen, Trophy, Mic2, Clapperboard, Sparkles,
  // Icônes Culture
  Atom, Calculator, Globe2, Landmark, Music, Palette, Brain,
  GraduationCap, Languages, FlaskConical, MonitorSmartphone,
  Microscope, HeartPulse, Telescope, Baby, BookMarked,
  Theater, Trophy as TrophyAlt, Search, Lightbulb,
} from 'lucide-react';

// Map clé string -> composant. Les clés respectent celles posées par
// scripts/migrate-channels-and-categories.js et la page admin.
const ICONS = {
  // Tubiscope
  cpu: Cpu,
  book: BookOpen,
  trophy: Trophy,
  mic: Mic2,
  sparkles: Sparkles,
  // Culture (clé générique 'book' déjà mappée, on ajoute des spécifiques)
  atom: Atom,
  calculator: Calculator,
  globe: Globe2,
  landmark: Landmark,
  music: Music,
  palette: Palette,
  brain: Brain,
  graduation: GraduationCap,
  languages: Languages,
  flask: FlaskConical,
  monitor: MonitorSmartphone,
  microscope: Microscope,
  heart: HeartPulse,
  telescope: Telescope,
  baby: Baby,
  theater: Theater,
  search: Search,
  lightbulb: Lightbulb,
  clapperboard: Clapperboard,
};

export function getCategoryIcon(iconKey, size = 18) {
  const Comp = ICONS[iconKey] || Sparkles;
  return <Comp size={size} />;
}

export default ICONS;
