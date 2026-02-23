import React from 'react';
import { Play, Trash2, Calendar, Trophy } from 'lucide-react';

const decodeHTML = (html) => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.documentElement.textContent;
};

export default function ProgramCard({ prog, large, onSelect, onRemove, canVote, onVote }) {
  const displayDate = prog.publishedAt || prog.createdAt;

  return (
    <div 
      className={`group relative flex-col shrink-0 snap-center cursor-pointer transition-all duration-300 ${large ? 'w-[80vw] md:w-[480px]' : 'w-[240px] md:w-[280px]'}`}
      onClick={() => onSelect(prog)}
    >
      <div className={`relative bg-slate-900 overflow-hidden shadow-lg border border-slate-800/50 group-hover:border-slate-500 transition-colors rounded-xl ${large ? 'h-[200px] md:h-[270px]' : 'h-[135px] md:h-[157px]'}`}>
        <img 
          src={`https://img.youtube.com/vi/${prog.youtubeId}/maxresdefault.jpg`} 
          onError={(e) => { e.target.onerror = null; e.target.src = `https://img.youtube.com/vi/${prog.youtubeId}/hqdefault.jpg`; }}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
          alt={decodeHTML(prog.title)} 
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80 z-10" />
        
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 z-20">
          <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center pl-1">
            <Play fill="white" size={20} className="text-white"/>
          </div>
        </div>
        
        {displayDate && (
          <div className="absolute bottom-2 left-2 bg-slate-900/90 border border-slate-700 backdrop-blur-md px-2 py-1 rounded text-[9px] text-slate-200 font-bold uppercase tracking-widest z-30 flex items-center gap-1">
            <Calendar size={8} className="text-indigo-400" />
            {new Date(displayDate).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short', year: 'numeric'})}
          </div>
        )}

        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 z-40 transition-opacity">
          {canVote && (
            <button onClick={(e) => { e.stopPropagation(); onVote(prog.id); }} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg">
              <Trophy size={12} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onRemove(prog.id); }} className="p-2 bg-slate-900/90 hover:bg-red-600 text-white rounded-full shadow-lg">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 truncate">{decodeHTML(prog.creatorName)}</span>
      <h3 className="font-semibold text-slate-100 text-sm leading-snug line-clamp-2">{decodeHTML(prog.title)}</h3>
    </div>
  );
}