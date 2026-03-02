import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProgramCard from './ProgramCard';

export default function ProgramRow({ title, programs, large = false, small = false, onSelect, onRemove, currentUser, isAdmin, toggleWatchLater, watchLaterList }) {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = large ? 500 : small ? 200 : 300;
      scrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  if (!programs || programs.length === 0) return null;

  return (
    <div className="mb-10 relative group">
      {title && <h2 className={`font-bold text-white mb-4 pl-2 md:pl-0 tracking-tight ${small ? 'text-lg md:text-xl text-indigo-200' : 'text-xl md:text-2xl'}`}>{title}</h2>}
      
      <button onClick={() => scroll('left')} className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -ml-6 z-10 bg-slate-800 hover:bg-indigo-600 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-2xl border border-slate-700">
        <ChevronLeft size={24} />
      </button>
      
      {/* C'est ici que la boucle .map manquait probablement ! */}
      <div ref={scrollRef} className="flex gap-4 md:gap-6 overflow-x-auto no-scrollbar snap-x snap-mandatory px-4 md:px-0 pb-4">
        {programs.map(prog => (
          <ProgramCard 
            key={prog.id} 
            prog={prog} 
            large={large} 
            small={small}
            onSelect={onSelect} 
            onRemove={onRemove}
            currentUser={currentUser}
            isAdmin={isAdmin}
            toggleWatchLater={toggleWatchLater}
            isWatchLater={watchLaterList?.includes(prog.youtubeId)}
          />
        ))}
      </div>

      <button onClick={() => scroll('right')} className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 -mr-6 z-10 bg-slate-800 hover:bg-indigo-600 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-2xl border border-slate-700">
        <ChevronRight size={24} />
      </button>
    </div>
  );
}
