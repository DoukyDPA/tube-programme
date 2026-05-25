import React, { useState, useEffect } from 'react';
import { auth, db, YOUTUBE_API_KEY } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import ProgramRow from './components/ProgramRow';
import ProgramCard from './components/ProgramCard';
import VideoModal from './components/VideoModal';
import Guide from './components/Guide';
import Legal from './components/Legal';
import PWAPrompt from './components/PWAPrompt';
import AccountModal from './components/AccountModal';

import { Sparkles, Home, Settings, Loader2, RefreshCw, LogOut, Cpu, BookOpen, Trophy, Mic2, Clapperboard, Info, UserCircle } from 'lucide-react';

const CATEGORIES = [
  { id: 'ia', label: 'IA & Tech Scope', icon: <Cpu size={18}/> },
  { id: 'lecture', label: 'Culture Scope', icon: <BookOpen size={18}/> },
  { id: 'foot', label: 'Economie Scope', icon: <Trophy size={18}/> },
  { id: 'interviews', label: 'Talks Scope', icon: <Mic2 size={18}/> },
  { id: 'divertissement', label: 'Divertissement Scope', icon: <Clapperboard size={18}/> },
];

// Ids des scopes éditeur (doivent matcher CATEGORIES ci-dessus)
const SCOPE_IDS = CATEGORIES.map(c => c.id);

// Nouveau composant d'icône TubiScope
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

const parseDuration = (duration) => {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0, 10) * 3600) + (parseInt(match[2] || 0, 10) * 60) + parseInt(match[3] || 0, 10);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Programmes scopes éditeur, indexés par scopeId
  const [scopePrograms, setScopePrograms] = useState({});
  // Programmes thèmes perso du user, indexés par themeId
  const [themePrograms, setThemePrograms] = useState({});

  const [hydratedPrograms, setHydratedPrograms] = useState([]);
  // Vidéos "À regarder plus tard" hydratées (10 max), liées au champ users/{uid}.watchLater
  const [hydratedWatchLater, setHydratedWatchLater] = useState([]);

  const [customThemes, setCustomThemes] = useState([]);
  const [activeTab, setActiveTab] = useState('accueil');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [legalTab, setLegalTab] = useState(null); // null = fermé, sinon 'mentions' | 'privacy' | 'terms'
  const [showAccount, setShowAccount] = useState(false);
  const [selectedProg, setSelectedProg] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const tokenResult = await u.getIdTokenResult();
          setIsAdmin(tokenResult.claims?.admin === true);
        } catch (e) {
          console.error("Erreur lecture du token:", e);
          setIsAdmin(false);
        }

        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setUserData(snap.data());
        } else {
          const initData = { isPremium: false, themeCount: 0, watchLater: [] };
          await setDoc(userRef, initData);
          setUserData(initData);
        }
      } else {
        setIsAdmin(false);
        setUserData(null);
        setScopePrograms({});
        setThemePrograms({});
      }
      setLoading(false);
    });
  }, []);

  // Listener sur chaque scope éditeur
  useEffect(() => {
    if (!user) return;
    const unsubs = SCOPE_IDS.map(scopeId => {
      const q = collection(db, 'scopes', scopeId, 'programs');
      return onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          _source: 'scope',
          _scopeId: scopeId,
        }));
        setScopePrograms(prev => ({ ...prev, [scopeId]: docs }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [user]);

  // Listener sur les thèmes perso du user
  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'users', user.uid, 'themes');
    return onSnapshot(q, (snap) => {
      setCustomThemes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  // Listener sur les programmes de chaque thème perso
  useEffect(() => {
    if (!user) return;
    if (customThemes.length === 0) {
      setThemePrograms({});
      return;
    }
    const unsubs = customThemes.map(theme => {
      const q = collection(db, 'users', user.uid, 'themes', theme.id, 'programs');
      return onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          _source: 'theme',
          _themeId: theme.id,
        }));
        setThemePrograms(prev => ({ ...prev, [theme.id]: docs }));
      });
    });

    // Nettoyage : on enlève les themePrograms qui ne correspondent plus à un thème actuel
    setThemePrograms(prev => {
      const next = {};
      customThemes.forEach(t => { if (prev[t.id]) next[t.id] = prev[t.id]; });
      return next;
    });

    return () => unsubs.forEach(u => u());
  }, [user, customThemes]);

  // Concaténation des deux sources
  const programs = [
    ...Object.values(scopePrograms).flat(),
    ...Object.values(themePrograms).flat(),
  ];

  // Hydratation YouTube (programmes courants + vidéos À regarder plus tard)
  useEffect(() => {
    const fetchYoutubeData = async () => {
      const watchLaterIds = userData?.watchLater || [];
      if (!YOUTUBE_API_KEY) return;
      if (programs.length === 0 && watchLaterIds.length === 0) {
        setHydratedPrograms([]);
        setHydratedWatchLater([]);
        return;
      }

      const uniqueIds = [...new Set([...programs.map(p => p.youtubeId), ...watchLaterIds])];
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
        } catch (e) {
          console.error("Erreur hydratation API YouTube:", e);
        }
      }

      const merged = programs.map(p => ({
        ...p,
        title: fetchedData[p.youtubeId]?.title || "Vidéo indisponible",
        creatorName: fetchedData[p.youtubeId]?.creatorName || "Créateur inconnu",
        publishedAt: fetchedData[p.youtubeId]?.publishedAt || p.createdAt,
      }));
      setHydratedPrograms(merged.sort((a,b) => b.publishedAt - a.publishedAt));

      // Vidéos "À regarder plus tard" : on hydrate même si la source a disparu d'un scope
      const wlMerged = watchLaterIds.map(id => {
        const existing = programs.find(p => p.youtubeId === id) || { id: `wl-${id}`, youtubeId: id, createdAt: Date.now() };
        return {
          ...existing,
          title: fetchedData[id]?.title || "Vidéo supprimée ou privée",
          creatorName: fetchedData[id]?.creatorName || "Inconnu",
          publishedAt: fetchedData[id]?.publishedAt || existing.createdAt,
        };
      });
      setHydratedWatchLater(wlMerged);
    };

    fetchYoutubeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(programs.map(p => p.id)), JSON.stringify(userData?.watchLater || [])]);

  // Toggle d'une vidéo dans la liste "À regarder plus tard" (10 max)
  const toggleWatchLater = async (prog) => {
    if (!user) return alert("Connectez-vous pour utiliser cette fonction.");
    const userRef = doc(db, 'users', user.uid);
    const currentWl = userData?.watchLater || [];
    const isWl = currentWl.includes(prog.youtubeId);

    try {
      if (isWl) {
        await setDoc(userRef, { watchLater: arrayRemove(prog.youtubeId) }, { merge: true });
        setUserData({ ...userData, watchLater: currentWl.filter(id => id !== prog.youtubeId) });
      } else {
        if (currentWl.length >= 10) {
          return alert("Limite atteinte : 10 vidéos maximum dans 'À regarder plus tard'.");
        }
        await setDoc(userRef, { watchLater: arrayUnion(prog.youtubeId) }, { merge: true });
        setUserData({ ...userData, watchLater: [...currentWl, prog.youtubeId] });
      }
    } catch (e) {
      alert("Erreur lors de l'enregistrement : " + e.message);
    }
  };

  // Helper : retourne la ref Firestore d'un programme selon sa source
  const programRef = (prog) => {
    if (prog._source === 'scope') {
      return doc(db, 'scopes', prog._scopeId, 'programs', prog.id);
    }
    // _source === 'theme'
    return doc(db, 'users', user.uid, 'themes', prog._themeId, 'programs', prog.id);
  };

  const syncWhatsNew = async () => {
    if (!YOUTUBE_API_KEY) return alert("❌ Clé API manquante !");
    if (!isAdmin) return alert("❌ Réservé à l'admin.");
    setIsSyncing(true);
    let addedCount = 0;
    let deletedCount = 0;

    try {
      // On ne sync que les scopes éditeur (les thèmes user sont gérés par leurs owners)
      const scopePrgs = Object.values(scopePrograms).flat();
      const channelsToUpdate = new Map();
      const videosByChannel = {};

      for (const p of scopePrgs) {
        if (p.channelId && p.categoryId) {
          if (!videosByChannel[p.channelId]) videosByChannel[p.channelId] = [];
          videosByChannel[p.channelId].push(p);
          channelsToUpdate.set(p.channelId, { id: p.channelId, category: p.categoryId });
        }
      }

      const channels = Array.from(channelsToUpdate.values());
      if (channels.length === 0) {
        setIsSyncing(false);
        return alert("Aucune chaîne trouvée dans les scopes.");
      }

      const addPromises = [];
      const deletePromises = [];

      for (const channel of channels) {
        const cid = channel.id;
        const playlistId = cid.replace(/^UC/, 'UU');

        const pRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&maxResults=5`);
        const pData = await pRes.json();
        if (!pData.items) continue;

        const videoIds = pData.items.map(v => v.contentDetails.videoId).join(',');
        const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails`);
        const detailsData = await detailsRes.json();

        const top5Ids = [];
        for (const v of pData.items) {
          const vidId = v.contentDetails.videoId;
          const detail = detailsData.items?.find(d => d.id === vidId);
          if (detail && parseDuration(detail.contentDetails.duration) >= 180) {
            top5Ids.push(vidId);
          }
        }

        const existingForChannel = videosByChannel[cid] || [];
        const existingIdsForChannel = existingForChannel.map(v => v.youtubeId);

        for (const vidId of top5Ids) {
          if (!existingIdsForChannel.includes(vidId)) {
            const newDocRef = doc(collection(db, 'scopes', channel.category, 'programs'));
            addPromises.push(setDoc(newDocRef, {
              youtubeId: vidId,
              channelId: cid,
              categoryId: channel.category,
              addedBy: user.uid,
              pitch: "",
              createdAt: Date.now(),
              avgScore: 0
            }));
            addedCount++;
          }
        }

        for (const existingVid of existingForChannel) {
          if (!top5Ids.includes(existingVid.youtubeId)) {
            deletePromises.push(deleteDoc(doc(db, 'scopes', existingVid._scopeId, 'programs', existingVid.id)));
            deletedCount++;
          }
        }
      }

      await Promise.all(addPromises);
      await Promise.all(deletePromises);

      alert(addedCount > 0 || deletedCount > 0
        ? `✅ Fait ! ${addedCount} vidéos ajoutées et ${deletedCount} anciennes vidéos supprimées.`
        : `ℹ️ Tout est à jour, rien à nettoyer.`);
    } catch (e) { alert(`❌ Erreur : ${e.message}`); }
    finally { setIsSyncing(false); }
  };

  const removeProgram = async (prog) => {
    // Sur un scope, seul l'admin peut supprimer
    if (prog._source === 'scope' && !isAdmin) {
      return alert("❌ Action refusée. Seul l'admin peut modifier les scopes éditeur.");
    }
    if (confirm("Supprimer définitivement ce programme ?")) {
      try { await deleteDoc(programRef(prog)); }
      catch(e) { alert("❌ Erreur : " + e.message); }
    }
  };

  const allCategories = [
    ...CATEGORIES,
    ...customThemes.map(ct => ({ id: ct.id, label: ct.name }))
  ];

  // Compte des chaînes uniques par catégorie (scope éditeur ou thème perso).
  // On utilise hydratedPrograms qui contient le creatorName récupéré via l'API YouTube.
  // Les programmes bruts de Firestore ne stockent que channelId et youtubeId.
  const getChannelsForCategory = (catId) => {
    const programs = hydratedPrograms.filter(p => p.categoryId === catId);
    const channels = new Map(); // channelId → creatorName
    programs.forEach(p => {
      if (p.channelId && !channels.has(p.channelId)) {
        channels.set(p.channelId, p.creatorName || '');
      }
    });
    return {
      count: channels.size,
      names: Array.from(channels.values()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'))
    };
  };

  // Avec le nouveau modèle, tous les programmes lus sont déjà personnalisés pour ce user :
  // ses propres thèmes + les scopes éditeur. Pas de filtrage supplémentaire nécessaire.
  const personalizedLatestPrograms = hydratedPrograms;

  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;
  if (!user) return <Auth />;

  return (
    <div className="min-h-screen md:h-screen bg-[#0a0f1c] text-slate-200 flex flex-col md:flex-row font-sans overflow-hidden">

      {/* Bandeaux PWA : nouvelle version + état hors ligne */}
      <PWAPrompt />

      {/* SIDEBAR PC */}
      <aside className="hidden md:flex w-[260px] bg-slate-950/95 border-r border-slate-800/50 flex-col z-50 overflow-y-auto shadow-2xl">
        <div className="p-8 flex items-center gap-3">
          <AppIcon />
          <h1 className="text-xl font-black text-white tracking-tight">Tubi<span className="text-indigo-500">Scope</span></h1>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <button onClick={() => setActiveTab('accueil')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'accueil' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
            <Home size={18} /> Accueil
          </button>

          <div className="mt-8 mb-3 px-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Catégories</div>
          {CATEGORIES.map(cat => {
            const { count, names } = getChannelsForCategory(cat.id);
            return (
              <div key={cat.id} className="relative group/cat">
                <button onClick={() => setActiveTab(cat.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === cat.id ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
                  <span className={activeTab === cat.id ? 'text-indigo-400' : 'text-slate-500'}>{cat.icon}</span>
                  <span className="text-sm whitespace-nowrap flex-1 text-left">{cat.label}</span>
                  {count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === cat.id ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-500'}`}>
                      {count}
                    </span>
                  )}
                </button>
                {count > 0 && (
                  <div className="hidden group-hover/cat:block absolute left-full top-0 ml-2 z-[60] bg-slate-800 border border-slate-700 rounded-xl p-3 min-w-[200px] max-w-[280px] shadow-2xl pointer-events-none">
                    <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-2">{count} chaîne{count > 1 ? 's' : ''}</div>
                    <ul className="text-xs text-slate-200 space-y-1 max-h-64 overflow-y-auto">
                      {names.map(n => <li key={n} className="truncate">{n}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {customThemes.length > 0 && (
            <>
              <div className="mt-8 mb-3 px-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Mes Thématiques</div>
              {customThemes.map(cat => {
                const { count, names } = getChannelsForCategory(cat.id);
                return (
                  <div key={cat.id} className="relative group/cat">
                    <button onClick={() => setActiveTab(cat.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === cat.id ? 'bg-emerald-600/10 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
                      <span className={activeTab === cat.id ? 'text-emerald-400' : 'text-slate-500'}>{getIconForCustomTheme(cat.icon)}</span>
                      <span className="text-sm whitespace-nowrap flex-1 text-left">{cat.name}</span>
                      {count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === cat.id ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                    {count > 0 && (
                      <div className="hidden group-hover/cat:block absolute left-full top-0 ml-2 z-[60] bg-slate-800 border border-slate-700 rounded-xl p-3 min-w-[200px] max-w-[280px] shadow-2xl pointer-events-none">
                        <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-2">{count} chaîne{count > 1 ? 's' : ''}</div>
                        <ul className="text-xs text-slate-200 space-y-1 max-h-64 overflow-y-auto">
                          {names.map(n => <li key={n} className="truncate">{n}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          <button onClick={() => setIsAdminOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all mt-4">
            <Settings size={18} /> Configurer
          </button>
          <button onClick={() => setActiveTab('guide')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'guide' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
            <Info size={18} /> Guide & légal
          </button>
        </nav>

        <div className="p-6 mt-auto border-t border-slate-800/50 space-y-3">
          <button onClick={() => setShowAccount(true)} className="w-full flex items-center gap-2 text-slate-400 hover:text-indigo-400 transition-colors text-sm font-semibold">
            <UserCircle size={16} /> Mon compte
          </button>
          <button onClick={() => signOut(auth)} className="w-full flex items-center gap-2 text-slate-500 hover:text-red-400 transition-colors text-sm font-semibold">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* NAVBAR MOBILE */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/98 backdrop-blur-lg border-t border-slate-800/50 flex justify-around items-center p-3 z-50 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button onClick={() => setActiveTab('accueil')} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'accueil' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <Home size={22} />
          <span className="text-[10px] font-bold">Accueil</span>
        </button>

        <button onClick={() => setIsAdminOpen(true)} className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-indigo-400 transition-colors">
          <Settings size={22} />
          <span className="text-[10px] font-bold">Config</span>
        </button>

        <button onClick={() => setShowAccount(true)} className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-indigo-400 transition-colors">
          <UserCircle size={22} />
          <span className="text-[10px] font-bold">Compte</span>
        </button>

        <button onClick={() => signOut(auth)} className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-red-400 transition-colors">
          <LogOut size={22} />
          <span className="text-[10px] font-bold">Sortir</span>
        </button>
      </div>

      {/* ZONE PRINCIPALE */}
      <main className="flex-1 overflow-y-auto h-screen pb-24 md:pb-0 relative">
        <header className="flex justify-between items-center p-4 md:p-10 pb-4 md:pb-8">
          <div className="flex items-center gap-3 md:hidden">
            <AppIcon />
            <h1 className="text-xl font-black text-white tracking-tight">Tubi<span className="text-indigo-500">Scope</span></h1>
          </div>

          <h2 className="hidden md:block text-2xl md:text-3xl font-bold text-white tracking-tight">
             {activeTab === 'accueil' ? 'À la Une' : activeTab === 'guide' ? 'Guide & légal' : allCategories.find(c => c.id === activeTab)?.label}
          </h2>

          {activeTab === 'accueil' && isAdmin && (
            <button onClick={syncWhatsNew} disabled={isSyncing} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50">
              {isSyncing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />}
              <span className="hidden md:inline">{isSyncing ? 'Recherche...' : 'Actualiser'}</span>
            </button>
          )}
        </header>

        <div className="px-0 md:px-10">
          {activeTab === 'guide' ? (
            <Guide onOpenLegal={(t) => setLegalTab(t)} />
          ) : activeTab === 'accueil' ? (
            <>
              <ProgramRow
                title="Dernières vidéos"
                programs={personalizedLatestPrograms.slice(0, 5)}
                large={true}
                onSelect={setSelectedProg}
                onRemove={removeProgram}
                currentUser={user}
                isAdmin={isAdmin}
                toggleWatchLater={toggleWatchLater}
                watchLaterList={userData?.watchLater || []}
              />

              {hydratedWatchLater.length > 0 && (
                <ProgramRow
                  title="À regarder plus tard"
                  programs={hydratedWatchLater}
                  small={true}
                  onSelect={setSelectedProg}
                  onRemove={removeProgram}
                  currentUser={user}
                  isAdmin={isAdmin}
                  toggleWatchLater={toggleWatchLater}
                  watchLaterList={userData?.watchLater || []}
                />
              )}

              {allCategories.map(cat => {
                const catProgs = hydratedPrograms.filter(p => p.categoryId === cat.id);
                if (catProgs.length === 0) return null;
                return (
                  <ProgramRow
                    key={cat.id}
                    title={cat.label}
                    programs={catProgs}
                    onSelect={setSelectedProg}
                    onRemove={removeProgram}
                    currentUser={user}
                    isAdmin={isAdmin}
                    toggleWatchLater={toggleWatchLater}
                    watchLaterList={userData?.watchLater || []}
                  />
                );
              })}
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4 md:px-0">
              {hydratedPrograms.filter(p => p.categoryId === activeTab).map(prog => (
                 <ProgramCard
                   key={prog.id}
                   prog={prog}
                   onSelect={setSelectedProg}
                   onRemove={removeProgram}
                   currentUser={user}
                   isAdmin={isAdmin}
                   toggleWatchLater={toggleWatchLater}
                   isWatchLater={(userData?.watchLater || []).includes(prog.youtubeId)}
                 />
              ))}
            </div>
          )}
        </div>
      </main>

      {selectedProg && <VideoModal prog={selectedProg} onClose={() => setSelectedProg(null)} />}
      {isAdminOpen && <AdminPanel user={user} userData={userData} customThemes={customThemes} isAdmin={isAdmin} hydratedPrograms={hydratedPrograms} onClose={() => setIsAdminOpen(false)} />}
      {legalTab && <Legal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
      {showAccount && <AccountModal user={user} onClose={() => setShowAccount(false)} />}
    </div>
  );
}
