import React from 'react';
import {
  BookOpen,
  Sparkles,
  Scale,
  ShieldCheck,
  Clock,
  FileText,
  Landmark,
} from 'lucide-react';

export default function Guide({ onOpenLegal }) {
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
          Votre curiosité remplace l'algorithme. Vous choisissez vos thématiques
          et vos chaînes YouTube, Tubiscope vous remonte les vidéos longues
          publiées par les créateurs que vous avez décidé de suivre. Pas de
          recommandation opaque, pas de capture d'attention.
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
              <span>Classez-les dans nos scopes éditeur ou créez vos propres thématiques (2 max en gratuit, illimité en Studio).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-bold shrink-0">3.</span>
              <span>TubiScope synchronise automatiquement les dernières vidéos (de plus de 3 minutes) pour vous garantir un flux de qualité.</span>
            </li>
            <li className="flex items-start gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
              <span className="text-indigo-500 font-bold shrink-0">4.</span>
              <span>
                <b>Sauvegardez vos découvertes :</b> survolez une vidéo et cliquez sur l'icône <Clock size={14} className="inline mx-1 text-slate-300" />
                pour l'ajouter à votre ligne <b>À regarder plus tard</b> (10 vidéos max). Ces vidéos sont protégées du nettoyage quotidien pendant 30 jours après leur ajout. Au-delà, elles suivent la rotation normale.
              </span>
            </li>
          </ul>
        </div>

        {/* Vision Studio */}
        <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900/50 border border-indigo-500/20 rounded-2xl p-6 md:p-8">
          <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-6">
            <Sparkles className="text-indigo-400" size={24} />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Bientôt : Tubiscope Studio</h3>
          <p className="text-slate-400 text-sm mb-4">
            Tubiscope est actuellement un projet personnel en phase bêta, gratuit pour tous.
            À l'avenir, une offre <b>Studio</b> verra le jour pour vous offrir des outils avancés (l'accès aux vidéos reste gratuit via YouTube) :
          </p>
          <ul className="space-y-2 text-indigo-200/70 text-sm">
            <li>✨ Création illimitée de thématiques personnelles</li>
            <li>✨ Suivi illimité de chaînes dans votre interface</li>
            <li>✨ Votes sur les scopes et chaînes éditeur</li>
            <li>✨ Parrainage entre membres Studio</li>
          </ul>
        </div>
      </div>

      {/* Tubiscope Culture */}
      <div className="bg-gradient-to-br from-fuchsia-900/20 to-slate-900/50 border border-fuchsia-500/20 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-fuchsia-500/15 rounded-xl flex items-center justify-center">
            <Landmark className="text-fuchsia-300" size={22} />
          </div>
          <h3 className="text-xl font-bold text-white">Tubiscope Culture</h3>
        </div>
        <p className="text-slate-300 text-sm mb-4 leading-relaxed">
          Tubiscope Culture est une version dédiée à la connaissance et à la
          transmission culturelle. Vous choisissez jusqu'à 7 thématiques parmi
          19 (Histoire, Sciences, Lettres, Arts, Économie, Philosophie, etc.)
          et nous vous proposons les dernières vidéos longues des chaînes
          curatées dans chaque domaine.
        </p>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-4">
          <p className="text-xs text-fuchsia-300 font-bold uppercase tracking-widest mb-2">
            Origine
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            Le projet s'appuie sur une sélection de <b>350 chaînes YouTube
            culturelles</b> publiée en 2018 par le <b>ministère de la Culture</b>.
            Cette base a été nettoyée des chaînes éteintes ou peu actives, puis
            réactualisée. Tubiscope Culture compte aujourd'hui environ
            <b> 200 chaînes vivantes</b>, réparties dans les 19 thématiques,
            et la sélection continue d'évoluer.
          </p>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          Rendez-vous sur{' '}
          <a
            href="https://tubiscope.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fuchsia-300 font-semibold hover:underline"
          >
            tubiscope.fr
          </a>{' '}
          pour explorer Tubiscope Culture. Gratuit, sans abonnement requis.
        </p>
      </div>

      {/* Documents légaux */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="text-slate-400" size={20} />
          <h3 className="text-lg font-bold text-white">Documents légaux</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Vous trouverez ici l'ensemble des informations relatives à l'éditeur, à la protection de vos données et aux règles d'utilisation du service.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <button
            onClick={() => onOpenLegal?.('mentions')}
            className="flex items-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/50 rounded-xl text-sm text-slate-200 font-semibold transition-all"
          >
            <Scale size={16} className="text-indigo-400" /> Mentions légales
          </button>
          <button
            onClick={() => onOpenLegal?.('privacy')}
            className="flex items-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/50 rounded-xl text-sm text-slate-200 font-semibold transition-all"
          >
            <ShieldCheck size={16} className="text-indigo-400" /> Confidentialité
          </button>
          <button
            onClick={() => onOpenLegal?.('terms')}
            className="flex items-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/50 rounded-xl text-sm text-slate-200 font-semibold transition-all"
          >
            <FileText size={16} className="text-indigo-400" /> CGU
          </button>
        </div>
      </div>

      {/* Rappel API YouTube */}
      <div className="bg-slate-900/30 border border-slate-800/30 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <Scale className="text-slate-500" size={20} />
          <h3 className="text-base font-bold text-white">Utilisation de l'API YouTube</h3>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          Tubiscope est un client de l'API YouTube Data v3. Les vidéos affichées restent hébergées par YouTube et Tubiscope n'en stocke aucune sur ses serveurs. En utilisant Tubiscope, vous acceptez d'être lié par les{' '}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
            Conditions d'utilisation YouTube
          </a>{' '}
          et la{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
            Politique de confidentialité Google
          </a>.
        </p>
      </div>

    </div>
  );
}
