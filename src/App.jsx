import React, { useState, useEffect } from 'react';
import { auth, db, FIREBASE_APP_ID, YOUTUBE_API_KEY } from './firebase'; 
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import ProgramRow from './components/ProgramRow';
import ProgramCard from './components/ProgramCard';
import VideoModal from './components/VideoModal'; 

import { Sparkles, Home, Settings, Loader2, RefreshCw, LogOut, Cpu, BookOpen, Trophy, Mic2 } from 'lucide-react';

const ADMIN_EMAIL = "daniel.p.angelini@gmail.com";

const CATEGORIES = [
  { id: 'ia', label: 'IA & Tech Scope', icon: <Cpu size={18}/> },
  { id: 'lecture', label: 'Culture Scope', icon: <BookOpen size={18}/> },
  { id: 'foot', label: 'Economie Scope', icon: <Trophy size={18}/> },
  { id: 'interviews', label: 'Talks Scope', icon: <Mic2 size={18}/> },
];

const AppIcon = () => (
  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="white" />
    </svg>
  </div>
);

const getIconForCustomTheme = (iconId) => {
  switch(iconId) {
    case 'ia': return <Cpu size={18}/>;
    case 'lecture': return <BookOpen size={18}/>;
    case 'foot': return <Trophy size={18}/>;
    case 'interviews': return <Mic2 size={18}/>;
    default: return <Sparkles size={18}/>;
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState([]); 
  const [hydratedPrograms, setHydratedPrograms] = useState([]); 
  const [customThemes, setCustomThemes] = useState([]);
  const [activeTab, setActiveTab] = useState('accueil');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedProg, setSelectedProg] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setUserData(snap.data());
        } else {
          const initData = { isPremium: false, themeCount: 0 };
          await setDoc(userRef, initData);
          setUserData(initData);
        }
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrograms(data); 
    });
  }, [user]);

  useEffect(() => {
    const fetchYoutubeData = async () => {
      if (!programs.length || !YOUTUBE_API_KEY) return;
      const uniqueIds = [...new Set(programs.map(p => p.youtubeId))];
      let fetchedData = {};
      
      for (let i = 0; i < uniqueIds.length; i += 50) {
        const chunk = uniqueIds.slice(i, i + 50).join(',');
        try {
          const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${chunk}&part=snippet`);
          const data = await res.json();
          if (data.items) {
            data.items.forEach(item => {
              fetchedData[item.id] = {
                title: item.snippet.title,
                creatorName: item.snippet.channelTitle,
                publishedAt: new Date(item.snippet.publishedAt).getTime(),
              };
            });
          }
        } catch (e) { console.error(e); }
      }

      const merged = programs.map(p => ({
        ...p,
        title: fetchedData[p.youtubeId]?.title || "Vidéo indisponible",
        creatorName: fetchedData[p.youtubeId]?.creatorName || "Créateur inconnu",
        publishedAt: fetchedData[p.youtubeId]?.publishedAt || p.createdAt,
      }));
      setHydratedPrograms(merged.sort((a,b) => b.publishedAt - a.publishedAt));
    };
    fetchYoutubeData();
  }, [programs]);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'users', user.uid, 'themes');
    return onSnapshot(q, (snap) => {
      setCustomThemes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  const syncWhatsNew = async () => {
    if (!isAdmin) return; 
    if (!YOUTUBE_API_KEY) return alert("Clé API manquante !");
    setIsSyncing(true);
    let addedCount = 0;
    try {
      const existingVideoIds = new Set(programs.map(p => p.youtubeId));
      const channelsToUpdate = new Map();
      
      programs.forEach(p => {
        if (p.channelId && p.categoryId) {
          channelsToUpdate.set(p.channelId, { id: p.channelId, category: p.categoryId, owner: p.addedBy });
        }
      });
      
      const channels = Array.from(channelsToUpdate.values());
      for (const channel of channels) {
        const playlistId = channel.id.replace(/^UC/, 'UU');
        const pRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&maxResults=5`);
        const pData = await pRes.json();
        if (!pData.items) continue;

        for (const v of pData.items) {
          const vidId = v.contentDetails.videoId;
          if (existingVideoIds.has(vidId)) continue; 
          
          const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
          await setDoc(newDocRef, {
            id: newDocRef.id, youtubeId: vidId, channelId: channel.id, categoryId: channel.category,
            addedBy: channel.owner, pitch: "", createdAt: Date.now(), avgScore: 0
          });
          addedCount++;
          existingVideoIds.add(vidId);
        }
      }
      alert(`Sync terminée. ${addedCount} vidéos ajoutées.`);
    } catch (e) { alert(e.message); } 
    finally { setIsSyncing(false); }
  };

  const removeProgram = async (prog) => {
    if (!isAdmin && prog.addedBy !== user.uid) return alert("Action refusée.");
    if (confirm("Supprimer ce programme ?")) {
      try { await deleteDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', prog.id)); }
      catch(e) { alert(e.message); }
    }
  };

  const myPrograms = hydratedPrograms.filter(p => p.addedBy === user.uid);
  const allCategories = [...CATEGORIES, ...customThemes.map(ct => ({ id: ct.id, label: ct.name }))];

  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;
  if (!user) return <Auth />;

  return (
    <div className="min-h-screen md:h-screen bg-[#0a0f1c] text-slate-200 flex flex-col md:flex-row font-sans overflow-hidden">
      <aside className="hidden md:flex w-[260px] bg-slate-950/95 border-r border-slate-800/50 flex-col z-50 overflow-y-auto">
        <div className="p-8 flex items-center gap-3">
          <AppIcon />
          <h1 className="text-xl font-black text-white tracking-tight">Tubi<span className="text-indigo-500">Scope</span></h1>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1">
          <button onClick={() => setActiveTab('accueil')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'accueil' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
            <Home size={18} /> Accueil
          </button>
          <div className="mt-8 mb-3 px-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Catégories</div>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveTab(cat.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === cat.id ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
              <span className={activeTab === cat.id ? 'text-indigo-400' : 'text-slate-500'}>{cat.icon}</span>
              <span className="text-sm">{cat.label}</span>
            </button>
          ))}
          <button onClick={() => setIsAdminOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all mt-4">
            <Settings size={18} /> Configurer
          </button>
        </nav>
        <div className="p-6 mt-auto border-t border-slate-800/50">
          <button onClick={() => signOut(auth)} className="w-full flex items-center gap-2 text-slate-500 hover:text-red-400 transition-colors text-sm font-semibold">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto h-screen pb-24 md:pb-0 relative">
        <header className="flex justify-between items-center p-4 md:p-10">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
             {activeTab === 'accueil' ? 'À la Une' : allCategories.find(c => c.id === activeTab)?.label}
          </h2>
          {/* SEUL L'ADMIN PEUT VOIR CE BOUTON */}
          {isAdmin && (
            <button onClick={syncWhatsNew} disabled={isSyncing} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg disabled:opacity-50">
              {isSyncing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />} 
              <span>Actualiser (Admin)</span>
            </button>
          )}
        </header>

        <div className="px-4 md:px-10">
          {activeTab === 'accueil' ? (
            <>
              <ProgramRow 
                title="Mes dernières vidéos" 
                programs={myPrograms.slice(0, 5)} 
                large={true} onSelect={setSelectedProg} onRemove={removeProgram} currentUser={user} isAdmin={isAdmin} 
              />
              {allCategories.map(cat => {
                const catProgs = myPrograms.filter(p => p.categoryId === cat.id);
                if (catProgs.length === 0) return null;
                return <ProgramRow key={cat.id} title={cat.label} programs={catProgs} onSelect={setSelectedProg} onRemove={removeProgram} currentUser={user} isAdmin={isAdmin} />;
              })}
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {myPrograms.filter(p => p.categoryId === activeTab).map(prog => (
                 <ProgramCard key={prog.id} prog={prog} onSelect={setSelectedProg} onRemove={removeProgram} currentUser={user} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </div>
      </main>

      {selectedProg && <VideoModal prog={selectedProg} onClose={() => setSelectedProg(null)} />}
      {isAdminOpen && <AdminPanel user={user} userData={userData} customThemes={customThemes} onClose={() => setIsAdminOpen(false)} />}
    </div>
  );
}
