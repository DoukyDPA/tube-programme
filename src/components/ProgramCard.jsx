import React from 'react';
import { Play, Calendar, Trash2, Clock } from 'lucide-react';

const decodeHTML = (html) => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.documentElement.textContent;
};

export default function ProgramCard({ prog, large, small, onSelect, onRemove, currentUser, isAdmin, toggleWatchLater, isWatchLater }) {
  const displayDate = prog.publishedAt || prog.createdAt;
  const canDelete = isAdmin || prog.addedBy === currentUser?.uid;

  // Gestion des 3 tailles possibles : large (Une), small (Regarder plus tard), ou standard
  let cardWidth = 'w-[240px] md:w-[280px]';
  let cardHeight = 'h-[135px] md:h-[157px]';
  if (large) {
    cardWidth = 'w-[80vw] md:w-[480px]';
    cardHeight = 'h-[200px] md:h-[270px]';
  } else if (small) {
    cardWidth = 'w-[180px] md:w-[220px]';
    cardHeight = 'h-[101px] md:h-[124px]';
  }

  return (
    <div 
      className={`group relative flex-col shrink-0 snap-center cursor-pointer transition-all duration-300 ${cardWidth}`}
      onClick={() => onSelect(prog)}
    >
      <div className={`relative bg-slate-900 overflow-hidden shadow-lg border border-slate-800/50 group-hover:border-slate-500 transition-colors rounded-xl ${cardHeight}`}>
        <img 
          src={`https://img.youtube.com/vi/${prog.youtubeId}/maxresdefault.jpg`} 
          onError={(e) => { e.target.onerror = null; e.target.src = `https://img.youtube.com/vi/${prog.youtubeId}/hqdefault.jpg`; }}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
          alt={decodeHTML(prog.title)} 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80 z-10" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 z-20">
          <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center pl-1"><Play fill="white" size={20} className="text-white"/></div>
        </div>
        
        {/* BOUTON À REGARDER PLUS TARD */}
        {toggleWatchLater && (
          <button 
            onClick={(e) => { e.stopPropagation(); toggleWatchLater(prog); }} 
            className={`absolute top-2 left-2 p-2 rounded-full z-40 shadow-lg transition-colors ${isWatchLater ? 'bg-indigo-600 text-white opacity-100' : 'bg-slate-900/90 text-slate-400 hover:text-white hover:bg-slate-800 opacity-0 group-hover:opacity-100'}`}
            title={isWatchLater ? "Retirer de 'À regarder plus tard'" : "À regarder plus tard"}
          >
            <Clock size={12} className={isWatchLater ? 'fill-indigo-600' : ''} />
          </button>
        )}

        {displayDate && (
          <div className="absolute bottom-2 left-2 flex items-center gap-2 z-30">
            <div className="bg-slate-900/90 border border-slate-700 backdrop-blur-md px-2 py-1 rounded text-[9px] text-slate-200 font-bold uppercase tracking-widest flex items-center gap-1">
              <Calendar size={8} className="text-indigo-400" />
              {!small && new Date(displayDate).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short', year: 'numeric'})}
              {small && new Date(displayDate).toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit', year: '2-digit'})}
            </div>
            <div className="bg-slate-900/90 border border-slate-700 backdrop-blur-md px-2 py-1 rounded flex items-center gap-1" title="Vidéo lue depuis YouTube">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-600">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
          </div>
        )}

        {/* Cacher la poubelle si on est sur la petite ligne pour éviter de confondre avec "Retirer des favoris" */}
        {canDelete && !small && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(prog); }} className="absolute top-2 right-2 p-2 bg-slate-900/90 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 z-40 shadow-lg">
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 truncate mt-2">{decodeHTML(prog.creatorName)}</span>
      <h3 className={`font-semibold text-slate-100 leading-snug line-clamp-2 ${small ? 'text-xs' : 'text-sm'}`} title={decodeHTML(prog.title)}>{decodeHTML(prog.title)}</h3>
    </div>
  );
}
