import React, { useState, useEffect } from 'react';
import { auth, db, FIREBASE_APP_ID } from './firebase'; // Import centralisé
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';

// Composants extraits
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import ProgramRow from './components/ProgramRow';
import VideoModal from './components/VideoModal';

import { Sparkles, Home, Settings, Loader2, RefreshCw } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState([]);
  const [activeTab, setActiveTab] = useState('accueil');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedProg, setSelectedProg] = useState(null);

  // Listener Auth & Profil
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

  // Sync des programmes
  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
    return onSnapshot(q, (snap) => {
      setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;
  if (!user) return <Auth />;

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-200 flex flex-col md:flex-row font-sans overflow-hidden">
      {/* Sidebar ... (même structure que précédemment) */}
      
      <main className="md:ml-[260px] flex-1 p-4 md:p-10 overflow-y-auto h-screen">
        <header className="flex justify-between items-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            {activeTab === 'accueil' ? 'À la Une' : 'Ma Sélection'}
          </h2>
          <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95">
            <RefreshCw size={16} /> <span className="hidden md:inline">Actualiser</span>
          </button>
        </header>

        {activeTab === 'accueil' && (
          <>
            <ProgramRow 
              title="Nouveautés" 
              programs={programs.slice(0, 5)} 
              large={true} 
              onSelect={setSelectedProg} 
            />
            {/* Autres rangées par catégories dynamiques */}
          </>
        )}
      </main>

      {selectedProg && <VideoModal prog={selectedProg} onClose={() => setSelectedProg(null)} />}
      {isAdminOpen && <AdminPanel user={user} userData={userData} onClose={() => setIsAdminOpen(false)} />}
    </div>
  );
}
