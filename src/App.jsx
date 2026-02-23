import React, { useState, useEffect } from 'react';
import { auth, db, FIREBASE_APP_ID } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';

// Composants
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import ProgramCard from './components/ProgramCard';
import VideoModal from './components/VideoModal';
import { Sparkles, Home, Settings, Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState([]);
  const [activeTab, setActiveTab] = useState('accueil');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedProg, setSelectedProg] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, 'users', u.uid));
        setUserData(snap.data());
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'), (snap) => {
      setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" /></div>;
  if (!user) return <Auth />;

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-200 flex flex-col md:flex-row font-sans">
      <aside className="w-[260px] bg-slate-950 border-r border-slate-800/50 fixed h-full flex flex-col z-50">
        <div className="p-8 flex items-center gap-3">
          <Sparkles className="text-indigo-600" />
          <h1 className="text-xl font-black text-white">Tube<span className="text-indigo-500">mag</span></h1>
        </div>
        <nav className="flex-1 px-4">
          <button onClick={() => setActiveTab('accueil')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${activeTab === 'accueil' ? 'bg-indigo-600/10 text-indigo-400' : ''}`}>
            <Home size={18} /> <span className="text-sm font-bold">Accueil</span>
          </button>
        </nav>
        <div className="p-6">
          <button onClick={() => setIsAdminOpen(true)} className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-500 uppercase flex items-center justify-center gap-2">
            <Settings size={14} /> Gérer
          </button>
        </div>
      </aside>

      <main className="ml-[260px] flex-1 p-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {programs.map(p => (
            <ProgramCard key={p.id} prog={p} onSelect={setSelectedProg} onRemove={() => {}} />
          ))}
        </div>
      </main>

      {selectedProg && <VideoModal prog={selectedProg} onClose={() => setSelectedProg(null)} />}
      {isAdminOpen && <AdminPanel user={user} userData={userData} onClose={() => setIsAdminOpen(false)} />}
    </div>
  );
}