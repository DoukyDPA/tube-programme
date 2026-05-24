import React from 'react';
import { X } from 'lucide-react';

export default function VideoModal({ prog, onClose }) {
  if (!prog) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-sm flex flex-col md:flex-row items-center justify-center p-0 md:p-10">
      <button onClick={onClose} className="absolute top-6 right-6 md:top-10 md:right-10 text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-all z-50 backdrop-blur-md">
        <X size={24} />
      </button>
      
      <div className="w-full h-[30vh] md:h-[80vh] md:w-[70vw] bg-black md:rounded-2xl overflow-hidden shadow-2xl flex-shrink-0">
        <iframe 
          width="100%" height="100%" 
          src={`https://www.youtube.com/embed/${prog.youtubeId}?autoplay=1`} 
          frameBorder="0" allowFullScreen title="YouTube"
        />
      </div>
      
      <div className="w-full flex-1 p-6 md:p-10 text-left overflow-y-auto">
        <span className="text-indigo-400 font-bold text-xs uppercase tracking-widest bg-indigo-500/10 px-3 py-1.5 rounded-full mb-4 inline-block">
          {prog.creatorName}
        </span>
        <h2 className="text-2xl md:text-4xl font-bold text-white leading-tight mb-6">{prog.title}</h2>
        
        {/* LIEN OBLIGATOIRE YOUTUBE */}
        <a 
          href={`https://www.youtube.com/watch?v=${prog.youtubeId}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-semibold transition-colors"
        >
          Regarder sur YouTube
        </a>
      </div>
    </div>
  );
}
