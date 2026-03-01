import React from 'react';
import { BookOpen, Sparkles, Scale, ShieldCheck } from 'lucide-react';

export default function Guide() {
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      
      {/* En-tête */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 text-indigo-500">
          <BookOpen size={120} />
        </div>
        <h2 className="text-3xl md:text-4xl font-black text-white mb-4 relative z-10">
          Bienvenue sur Tubi<span className="text-indigo-500">Scope</span>
        </h2>
        <p className="text-slate-400 text-lg max-w-2xl relative z-10">
          Votre curateur vidéo personnel. TubiScope filtre le bruit de YouTube pour ne vous proposer que des contenus longs, pertinents et organisés selon vos propres centres d'intérêt.
        </p>
      </div>

      {/* Mode d'emploi */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 md:p-8">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6">
            <BookOpen className="text-indigo-400" size={24} />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Comment ça marche ?</h3>
          <ul className="space-y-3 text-slate-400 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-bold">1.</span>
              Allez dans <b>Configurer</b> pour ajouter vos chaînes YouTube favorites.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-bold">2.</span>
              Classez-les dans nos catégories pré-existantes ou créez vos propres thématiques.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-bold">3.</span>
              TubiScope synchronise automatiquement les dernières vidéos (de plus de 3 minutes) pour vous garantir un flux de qualité.
            </li>
          </ul>
        </div>

        {/* Vision Premium */}
        if (!userData?.isPremium && customThemes.length >= 2) return alert("💎 Limite atteinte. Passez Premium pour débloquer des outils d'organisation et des dossiers supplémentaires.");
      </div>

      {/* Informations Légales */}
      <div className="bg-slate-900/30 border border-slate-800/30 rounded-2xl p-6 md:p-8 mt-12">
        <div className="flex items-center gap-3 mb-6">
          <Scale className="text-slate-500" size={24} />
          <h3 className="text-lg font-bold text-white">Informations Légales & Données</h3>
        </div>
        
        <div className="space-y-6 text-sm text-slate-500">
          <div>
            <h4 className="font-semibold text-slate-300 mb-1 flex items-center gap-2">
              <ShieldCheck size={16} /> Statut du projet
            </h4>
            <p>
              Ce service est actuellement un projet personnel à but non lucratif. Il est fourni "en l'état", sans garantie de disponibilité continue.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold text-slate-300 mb-1">Utilisation de l'API YouTube</h4>
            <p>
              TubiScope utilise l'API officielle de YouTube (YouTube Data API v3). Toutes les vidéos diffusées via ce service restent hébergées par YouTube. Les vues générées depuis TubiScope sont comptabilisées directement au profit des créateurs originaux. TubiScope ne stocke aucune vidéo sur ses propres serveurs. En utilisant TubiScope, vous acceptez également les Conditions d'Utilisation de YouTube.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-300 mb-1">Confidentialité</h4>
            <p>
              L'authentification est gérée de manière sécurisée par Firebase (Google). Vos données de configuration (thèmes et chaînes suivies) sont privées et ne sont en aucun cas revendues à des tiers.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
