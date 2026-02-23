import React, { useState, useEffect } from 'react';
import { auth, db, FIREBASE_APP_ID, YOUTUBE_API_KEY } from './firebase'; 
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, getDoc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';

import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import ProgramRow from './components/ProgramRow';
import VideoModal from './components/VideoModal';

import { Sparkles, Home, Settings, Loader2, RefreshCw, LogOut } from 'lucide-react';

const decodeHTML = (html) => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.documentElement.textContent;
};

const parseDuration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0, 10) * 3600) + (parseInt(match[2] || 0, 10) * 60) + parseInt(match[3] || 0, 10);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState([]);
  const [activeTab, setActiveTab] = useState('accueil');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedProg, setSelectedProg] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false); // Nouvel état pour la sync

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
      // Tri par date de publication
      setPrograms(data.sort((a,b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0)));
    });
  }, [user]);

  const removeProgram = async (id) => {
    if (confirm("Supprimer définitivement ce programme ?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', id));
      } catch(e) { alert("❌ Erreur : " + e.message); }
    }
  };

  // NOUVELLE FONCTION DE SYNCHRONISATION
  const syncWhatsNew = async () => {
    if (!YOUTUBE_API_KEY) return alert("❌ Clé API manquante !");
    setIsSyncing(true);
    let addedCount = 0;

    try {
      const existingVideoIds = new Set(programs.map(p => p.youtubeId));
      const channelsToUpdate = new Map();
      
      for (const p of programs) {
        if (p.channelId && p.categoryId) {
          channelsToUpdate.set(p.channelId, { id: p.channelId, category: p.categoryId, name: p.creatorName });
        } else if (p.creatorName && p.categoryId) {
          channelsToUpdate.set(p.creatorName, { name: p.creatorName, category: p.categoryId, needsIdFetch: true });
        }
      }

      const channels = Array.from(channelsToUpdate.values());
      if (channels.length === 0) {
        setIsSyncing(false);
        return alert("Aucune chaîne trouvée. Ajoutez d'abord une chaîne manuellement.");
      }

      for (const channel of channels) {
        let cid = channel.id;
        if (channel.needsIdFetch) {
          const res = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&q=${encodeURIComponent(channel.name)}&type=channel&part=snippet`);
          const data = await res.json();
          if (data.items && data.items.length > 0) cid = data.items[0].snippet.channelId;
          else continue;
        }

        const vRes = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${cid}&part=snippet,id&order=date&maxResults=10&type=video`);
        const vData = await vRes.json();
        if (!vData.items) continue;

        const videoIds = vData.items.map(v => v.id.videoId).join(',');
        const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails`);
        const detailsData = await detailsRes.json();

        const promises = [];
        for (const v of vData.items) {
          if (existingVideoIds.has(v.id.videoId)) continue; 

          const detail = detailsData.items?.find(d => d.id === v.id.videoId);
          if (!detail || parseDuration(detail.contentDetails.duration) < 180) continue; 

          const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
          promises.push(setDoc(newDocRef, {
            id: newDocRef.id,
            youtubeId: v.id.videoId,
            channelId: cid,
            title: decodeHTML(v.snippet.title),
            creatorName: decodeHTML(v.snippet.channelTitle),
            categoryId: channel.category,
            pitch: "",
            createdAt: Date.now(),
            publishedAt: new Date(v.snippet.publishedAt).getTime(),
            avgScore: 0
          }));
          addedCount++;
          existingVideoIds.add(v.id.videoId); 
        }
        await Promise.all(promises);
      }

      alert(addedCount > 0 ? `✅ C'est tout frais ! ${addedCount} nouvelles vidéos ajoutées.` : `ℹ️ Tout est à jour.`);
    } catch (e) { alert(`❌ Erreur : ${e.message}`); } 
    finally { setIsSyncing(false); }
  };

  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;
  if (!user) return <Auth />;

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-200 flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-full md:w-[260px] bg-slate-950/95 border-r border-slate-800/50 flex flex-col z-50">
        <div className="p-8 flex items-center gap-3">
          <Sparkles size={20} className="text-indigo-500" />
          <h1 className="text-xl font-black text-white tracking-tight">Tubemag</h1>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-2">
          <button onClick={() => setActiveTab('accueil')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'accueil' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
            <Home size={18} /> Accueil
          </button>
          
          <button onClick={() => setIsAdminOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all mt-4">
            <Settings size={18} /> Configurer
          </button>
        </nav>

        <div className="p-6 mt-auto">
          <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-slate-500 hover:text-red-400 transition-colors text-sm font-semibold">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>
      
      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 md:p-10 overflow-y-auto h-screen">
        <header className="flex justify-between items-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">À la Une</h2>
          
          <button onClick={syncWhatsNew} disabled={isSyncing} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50">
            {isSyncing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />} 
            <span className="hidden md:inline">{isSyncing ? 'Recherche...' : 'Actualiser'}</span>
          </button>
        </header>

        {activeTab === 'accueil' && (
          <ProgramRow 
            title="Dernières vidéos" 
            programs={programs} 
            large={true} 
            onSelect={setSelectedProg} 
            onRemove={removeProgram} 
          />
        )}
      </main>

      {selectedProg && <VideoModal prog={selectedProg} onClose={() => setSelectedProg(null)} />}
      {isAdminOpen && <AdminPanel user={user} userData={userData} onClose={() => setIsAdminOpen(false)} />}
    </div>
  );
}
