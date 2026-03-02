import React from 'react';
import { BookOpen, Sparkles, Scale, ShieldCheck, Clock } from 'lucide-react';

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
          <ul className="space-y-4 text-slate-400 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-bold shrink-0">1.</span>
              <span>Allez dans <b>Configurer</b> pour ajouter vos chaînes YouTube favorites.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-bold shrink-0">2.</span>
              <span>Classez-les dans nos catégories pré-existantes ou créez vos propres thématiques.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-bold shrink-0">3.</span>
              <span>TubiScope synchronise automatiquement les dernières vidéos (de plus de 3 minutes) pour vous garantir un flux de qualité.</span>
            </li>
            <li className="flex items-start gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
              <span className="text-indigo-500 font-bold shrink-0">4.</span>
              <span>
                <b>Sauvegardez vos découvertes :</b> Survolez une vidéo et cliquez sur l'icône <Clock size={14} className="inline mx-1 text-slate-300" /> 
                pour l'ajouter à votre ligne <b>À regarder plus tard</b> (10 vidéos max). Ces vidéos y resteront stockées en sécurité et survivront au nettoyage quotidien !
              </span>
            </li>
          </ul>
        </div>

        {/* Vision Premium */}
        <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900/50 border border-indigo-500/20 rounded-2xl p-6 md:p-8">
          <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-6">
            <Sparkles className="text-indigo-400" size={24} />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Bientôt : TubiScope Premium</h3>
          <p className="text-slate-400 text-sm mb-4">
            TubiScope est actuellement un service personnel en phase bêta. 
            À l'avenir, une offre <b>Premium</b> verra le jour pour vous offrir des outils d'interface avancés (l'accès aux vidéos reste gratuit via YouTube) :
          </p>
          <ul className="space-y-2 text-indigo-200/70 text-sm">
            <li>✨ Création illimitée de dossiers de thématiques</li>
            <li>✨ Suivi illimité de chaînes dans votre interface</li>
            <li>✨ Filtres avancés pour organiser vos découvertes</li>
          </ul>
        </div>
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
            <p className="leading-relaxed">
              TubiScope est un client API qui utilise les services de l'API YouTube (YouTube Data API v3). Toutes les vidéos diffusées via ce service restent hébergées par YouTube et TubiScope ne stocke aucune vidéo sur ses serveurs. 
              En utilisant TubiScope, vous acceptez d'être lié par les <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Conditions d'utilisation de YouTube</a> ainsi que par les <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Règles de confidentialité de Google</a>.
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
