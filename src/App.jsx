import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
// Ajout de getDocs pour vérifier les doublons
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc, getDocs } from 'firebase/firestore';
import { 
  Cpu, BookOpen, Trophy, Mic2, Home, Sparkles, X, Trash2, Lock, AlertCircle, Settings, CheckCircle2, ServerCrash, Loader2, ChevronLeft, ChevronRight, Play, Calendar
} from 'lucide-react';

/**
 * CONFIGURATION VIA VARIABLES D'ENVIRONNEMENT
 */
const getEnv = (key, fallback = "") => {
  try { return import.meta.env[key] || fallback; } 
  catch (e) { return fallback; }
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

const YOUTUBE_API_KEY = getEnv('VITE_YOUTUBE_API_KEY');
const ADMIN_PASS = getEnv('VITE_ADMIN_PASS', "1234");
const FIREBASE_APP_ID = "tube-prog-v0";

let db, auth;
if (firebaseConfig.apiKey) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) { console.error("Erreur Firebase:", error); }
}

const CATEGORIES = [
  { id: 'ia', label: 'IA & Tech', icon: <Cpu size={18}/> },
  { id: 'lecture', label: 'Culture & Livres', icon: <BookOpen size={18}/> },
  { id: 'foot', label: 'Analyse Foot', icon: <Trophy size={18}/> },
  { id: 'interviews', label: 'Talks & Débats', icon: <Mic2 size={18}/> },
];

// --- UTILITAIRE : NETTOYEUR DE TEXTE ---
const decodeHTML = (html) => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.documentElement.textContent;
};

// --- UTILITAIRE : CONVERSION DURÉE YOUTUBE ---
const parseDuration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || 0, 10);
  const m = parseInt(match[2] || 0, 10);
  const s = parseInt(match[3] || 0, 10);
  return h * 3600 + m * 60 + s;
};

// --- COMPOSANT : PANNEAU DE CURATION ---
const AdminPanel = ({ onClose }) => {
  const [passInput, setPassInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('ia');

  const checkPass = () => {
    if (passInput === ADMIN_PASS) setIsUnlocked(true);
    else alert("Code erroné");
  };

  // --- 1. IMPORT MANUEL CLASSIQUE ---
  const fetchAndAutoIntegrate = async () => {
    if (!YOUTUBE_API_KEY) return alert("❌ Clé API YouTube manquante !");
    if (!channelInput.trim()) return alert("Veuillez entrer une chaîne (ex: @MonsieurPhi).");
    
    setLoading(true);
    try {
      let cid = channelInput.trim();
      
      if (cid.startsWith('@')) {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=${cid}&part=id`);
        const data = await res.json();
        if (data.items?.length > 0) cid = data.items[0].id;
        else throw new Error("Chaîne introuvable sur YouTube.");
      }
      
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${cid}&part=snippet,id&order=date&maxResults=30&type=video`);
      const vData = await vRes.json();
      
      if (!vData.items || vData.items.length === 0) throw new Error("Aucune vidéo trouvée pour cette chaîne.");

      const videoIds = vData.items.map(v => v.id.videoId).join(',');
      const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails`);
      const detailsData = await detailsRes.json();

      const longVideos = vData.items.filter(v => {
        const detail = detailsData.items?.find(d => d.id === v.id.videoId);
        if (!detail) return false;
        return parseDuration(detail.contentDetails.duration) >= 120;
      }).slice(0, 5); 

      if (longVideos.length === 0) throw new Error("Aucune vidéo de plus de 2 minutes trouvée.");

      if (!db) throw new Error("Base de données non connectée.");
      
      const promises = longVideos.map(v => {
        const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
        const publishedTimestamp = new Date(v.snippet.publishedAt).getTime();

        return setDoc(newDocRef, {
          id: newDocRef.id,
          youtubeId: v.id.videoId,
          title: decodeHTML(v.snippet.title), 
          creatorName: decodeHTML(v.snippet.channelTitle), 
          categoryId: category,
          pitch: "", 
          createdAt: Date.now(),
          publishedAt: publishedTimestamp,
          avgScore: 0
        });
      });

      await Promise.all(promises); 
      alert(`✅ Succès ! ${longVideos.length} vidéos longues ajoutées.`);
      onClose(); 

    } catch (e) { 
      alert(`❌ ERREUR :\n${e.message}`); 
    }
    finally { setLoading(false); }
  };

  // --- 2. LE BOUTON MAGIQUE : QUOI DE NEUF ? ---
  const syncWhatsNew = async () => {
    if (!YOUTUBE_API_KEY) return alert("❌ Clé API manquante !");

    // 👇 AJOUTEZ VOS CHAÎNES ICI 👇
    const CHANNELS_TO_MONITOR = [
      { handle: "@MonsieurPhi", category: "ia" },
      { handle: "@NotaBene", category: "lecture" },
      { handle: "@Wiloo", category: "foot" }
    ];

    setLoading(true);
    let addedCount = 0;

    try {
      // 1. On récupère les ID des vidéos déjà présentes pour éviter les doublons
      const programsRef = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
      const existingSnap = await getDocs(programsRef);
      const existingIds = new Set(existingSnap.docs.map(d => d.data().youtubeId));

      // 2. On scanne chaque chaîne de la liste
      for (const channel of CHANNELS_TO_MONITOR) {
        // Trouver ID de la chaîne
        const cRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=${channel.handle}&part=id`);
        const cData = await cRes.json();
        if (!cData.items || cData.items.length === 0) continue;
        const cid = cData.items[0].id;

        // Récupérer les 5 dernières vidéos (inutile d'en prendre 30, on cherche juste la nouveauté du jour)
        const vRes = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${cid}&part=snippet,id&order=date&maxResults=5&type=video`);
        const vData = await vRes.json();
        if (!vData.items) continue;

        const videoIds = vData.items.map(v => v.id.videoId).join(',');
        const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails`);
        const detailsData = await detailsRes.json();

        const promises = [];
        for (const v of vData.items) {
          if (existingIds.has(v.id.videoId)) continue; // 🛑 Déjà dans la base = on l'ignore

          const detail = detailsData.items?.find(d => d.id === v.id.videoId);
          if (!detail || parseDuration(detail.contentDetails.duration) < 120) continue; // 🛑 C'est un short = on l'ignore

          // 🟢 Nouvelle vidéo valide trouvée ! On l'ajoute.
          const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
          promises.push(setDoc(newDocRef, {
            id: newDocRef.id,
            youtubeId: v.id.videoId,
            title: decodeHTML(v.snippet.title),
            creatorName: decodeHTML(v.snippet.channelTitle),
            categoryId: channel.category,
            pitch: "",
            createdAt: Date.now(),
            publishedAt: new Date(v.snippet.publishedAt).getTime(),
            avgScore: 0
          }));
          addedCount++;
          existingIds.add(v.id.videoId); // Met à jour la mémoire locale anti-doublon
        }
        await Promise.all(promises);
      }

      alert(`✅ Synchronisation terminée ! ${addedCount} nouvelles vidéos trouvées et ajoutées à Tubemag.`);
      if (addedCount > 0) onClose();

    } catch (e) {
      alert(`❌ Erreur lors de la synchronisation : ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950/98 flex items-center justify-center p-6 backdrop-blur-md">
        <div className="w-full max-w-sm bg-slate-900 p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl text-center">
          <Lock className="mx-auto mb-6 text-indigo-500" size={32} />
          <h2 className="text-xl font-bold mb-6 text-white tracking-tight">Accès Curation</h2>
          <input type="password" placeholder="Code secret" className="w-full bg-slate-800 p-4 rounded-2xl mb-4 text-center text-white outline-none ring-2 ring-transparent focus:ring-indigo-500" value={passInput} onChange={e => setPassInput(e.target.value)} />
          <button onClick={checkPass} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-indigo-500">Déverrouiller</button>
          <button onClick={onClose} className="mt-6 text-slate-500 text-xs hover:text-white">Retour</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2rem] p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <Settings className="text-indigo-500" size={20} /> Curation Tubemag
          </h2>
          <button onClick={onClose} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white"><X size={16} /></button>
        </div>

        {/* Bloc 1 : Ajout manuel */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">1. Thématique</label>
            <select className="w-full bg-slate-800 p-4 rounded-xl text-sm border-none outline-none text-white focus:ring-2 focus:ring-indigo-500" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">2. Chaîne YouTube (Ajout manuel)</label>
            <input className="w-full bg-slate-800 p-4 rounded-xl text-sm outline-none text-white focus:ring-2 focus:ring-indigo-500" placeholder="ex: @MonsieurPhi" value={channelInput} onChange={e => setChannelInput(e.target.value)} />
          </div>
          <button onClick={fetchAndAutoIntegrate} disabled={loading} className="w-full mt-4 bg-emerald-600 py-4 rounded-xl font-bold text-sm text-white hover:bg-emerald-500 disabled:opacity-50 flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18}/> : <><CheckCircle2 size={18} /> Aspirer manuellement</>}
          </button>
        </div>

        {/* Bloc 2 : Le bouton magique */}
        <div className="mt-8 pt-8 border-t border-slate-800">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 text-center">Ou scanner vos chaînes favorites</h3>
          <button onClick={syncWhatsNew} disabled={loading} className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-sm text-white hover:bg-indigo-500 disabled:opacity-50 flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(79,70,229,0.2)]">
            {loading ? <Loader2 className="animate-spin" size={18}/> : <><Sparkles size={18} /> Quoi de neuf aujourd'hui ?</>}
          </button>
        </div>
      </div>
    </div>
  );
};


// --- COMPOSANT : CARTE VIDÉO ---
const ProgramCard = ({ prog, large, onSelect, onRemove }) => {
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
        
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent opacity-90 z-10" />
        
        {displayDate && (
          <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-700 backdrop-blur-md px-2 py-1 rounded-md text-[10px] text-slate-200 font-bold uppercase tracking-widest z-30 shadow-xl flex items-center gap-1.5">
            <Calendar size={10} className="text-indigo-400" />
            {new Date(displayDate).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short', year: 'numeric'})}
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30 z-20">
          <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center pl-1 shadow-2xl scale-75 group-hover:scale-100 transition-transform">
            <Play fill="white" size={24} className="text-white" />
          </div>
        </div>

        <button onClick={(e) => { e.stopPropagation(); onRemove(prog.id); }} className="absolute top-3 right-3 p-2 bg-slate-900/90 hover:bg-red-600 text-slate-300 hover:text-white rounded-full opacity-100 md:opacity-0 group-hover:opacity-100 transition-all z-40 shadow-lg">
          <Trash2 size={14} />
        </button>
      </div>
      
      <div className="mt-3 px-1 w-full">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 truncate">{decodeHTML(prog.creatorName)}</span>
        <h3 className={`font-semibold text-slate-100 leading-snug group-hover:text-white transition-colors line-clamp-2 ${large ? 'text-lg md:text-xl' : 'text-sm'}`} title={decodeHTML(prog.title)}>{decodeHTML(prog.title)}</h3>
      </div>
    </div>
  );
};


// --- COMPOSANT : RANGÉE CARROUSEL ---
const ProgramRow = ({ title, programs, large = false, onSelect, onRemove }) => {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = large ? 500 : 300;
      scrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  if (!programs || programs.length === 0) return null;

  return (
    <div className="mb-10 relative group">
      {title && <h2 className="text-xl md:text-2xl font-bold text-white mb-4 pl-2 md:pl-0 tracking-tight">{title}</h2>}
      
      <button onClick={() => scroll('left')} className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -ml-6 z-10 bg-slate-800 hover:bg-indigo-600 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-2xl border border-slate-700">
        <ChevronLeft size={24} />
      </button>
      
      <div ref={scrollRef} className="flex gap-4 md:gap-6 overflow-x-auto no-scrollbar snap-x snap-mandatory px-4 md:px-0 pb-4">
        {programs.map(prog => (
          <ProgramCard key={prog.id} prog={prog} large={large} onSelect={onSelect} onRemove={onRemove} />
        ))}
      </div>

      <button onClick={() => scroll('right')} className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 -mr-6 z-10 bg-slate-800 hover:bg-indigo-600 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-2xl border border-slate-700">
        <ChevronRight size={24} />
      </button>
    </div>
  );
};


// --- APP PRINCIPALE ---
export default function App() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const [programs, setPrograms] = useState([]);
  const [activeTab, setActiveTab] = useState('accueil');
  const [selectedProg, setSelectedProg] = useState(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch((error) => setAuthError(error.message));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!db || !user) return;
    setIsFetching(true); 
    const q = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrograms(data.sort((a,b) => {
        const timeA = a.publishedAt || a.createdAt || 0;
        const timeB = b.publishedAt || b.createdAt || 0;
        return timeB - timeA;
      }));
      setIsFetching(false);
    }, (err) => {
      console.error("Erreur Snapshot Firebase:", err);
      setAuthError("Permission Firebase refusée. Vérifiez les règles.");
      setIsFetching(false);
    });
    return () => unsub();
  }, [user]);

  const removeProgram = async (id) => {
    if (confirm("Supprimer définitivement ce programme ?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', id));
      } catch(e) { alert("❌ Erreur : " + e.message); }
    }
  };

  if (!firebaseConfig.apiKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8 text-white">
        <div className="max-w-md bg-slate-900 p-12 rounded-[2rem] border border-indigo-500/20 text-center">
          <AlertCircle size={48} className="mx-auto mb-6 text-indigo-500" />
          <h2 className="text-xl font-bold mb-4">Projet Non Configuré</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-200 flex flex-col md:flex-row font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-full md:w-[260px] bg-slate-950/95 border-t md:border-t-0 md:border-r border-slate-800/50 fixed bottom-0 md:top-0 md:h-full flex flex-row md:flex-col z-50 overflow-x-auto no-scrollbar md:overflow-hidden items-center md:items-stretch pb-safe">
        
        <div className="hidden md:flex p-8 items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center"><Sparkles size={16} className="text-white" /></div>
          <h1 className="text-xl font-black text-white tracking-tight">Tube<span className="text-indigo-500">mag</span></h1>
        </div>
        
        <nav className="flex-1 px-2 md:px-4 py-3 md:py-0 flex flex-row md:flex-col gap-1 overflow-x-auto no-scrollbar items-center md:items-stretch">
          <button onClick={() => setActiveTab('accueil')} className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 md:py-3.5 rounded-xl transition-all ${activeTab === 'accueil' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
            <Home size={18} /> <span className="text-sm">Accueil</span>
          </button>
          
          <div className="hidden md:block mt-8 mb-3 px-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Catégories</div>
          <div className="w-px h-6 bg-slate-800 md:hidden mx-2"></div>

          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveTab(cat.id)} className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 md:py-3.5 rounded-xl transition-all ${activeTab === cat.id ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
              <span className={activeTab === cat.id ? 'text-indigo-400' : 'text-slate-500'}>{cat.icon}</span>
              <span className="text-sm whitespace-nowrap">{cat.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2 md:p-6 flex-shrink-0">
          <button onClick={() => setIsAdminOpen(true)} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-500 hover:text-white transition-all flex items-center justify-center gap-2">
            <Lock size={14} /> <span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Curation</span>
          </button>
        </div>
      </aside>

      {/* --- ZONE PRINCIPALE --- */}
      <main className="md:ml-[260px] flex-1 p-0 md:p-10 mb-20 md:mb-0 w-full overflow-x-hidden overflow-y-auto bg-[#0a0f1c]">
        
        {/* Header */}
        <header className="px-6 md:px-0 pt-8 pb-4 flex justify-between items-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            {activeTab === 'accueil' ? 'En ce moment' : CATEGORIES.find(c => c.id === activeTab)?.label}
          </h2>
          <div className="hidden md:block">
             {authError ? <span className="text-red-500 text-xs font-bold bg-red-500/10 px-3 py-1.5 rounded-full flex gap-2"><ServerCrash size={14} /> Erreur Auth</span> 
             : isFetching ? <span className="text-indigo-400 text-xs font-bold bg-indigo-500/10 px-3 py-1.5 rounded-full flex gap-2"><Loader2 size={14} className="animate-spin"/> Sync...</span>
             : user ? <span className="text-emerald-500 text-xs font-bold bg-emerald-500/10 px-3 py-1.5 rounded-full flex gap-2"><CheckCircle2 size={14} /> En ligne</span> : null}
          </div>
        </header>

        {isFetching && programs.length === 0 ? (
           <div className="w-full h-[50vh] flex justify-center items-center"><Loader2 size={40} className="animate-spin text-indigo-500/50" /></div>
        ) : programs.length === 0 ? (
           <div className="m-6 border-2 border-dashed border-slate-800 rounded-2xl p-20 text-center">
             <p className="text-slate-500 font-bold mb-4">Aucun programme disponible.</p>
             <button onClick={() => setIsAdminOpen(true)} className="text-indigo-400 hover:text-white underline">Ajouter des vidéos</button>
           </div>
        ) : (
          <div className="pb-10 pt-4">
            {/* VUE ACCUEIL */}
            {activeTab === 'accueil' && (
              <>
                <ProgramRow programs={programs.slice(0, 5)} large={true} onSelect={setSelectedProg} onRemove={removeProgram} />
                {CATEGORIES.map(cat => {
                  const catProgs = programs.filter(p => p.categoryId === cat.id);
                  return catProgs.length > 0 ? (
                    <ProgramRow key={cat.id} title={cat.label} programs={catProgs} onSelect={setSelectedProg} onRemove={removeProgram} />
                  ) : null;
                })}
              </>
            )}

            {/* VUE CATÉGORIE SPÉCIFIQUE */}
            {activeTab !== 'accueil' && (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-4 md:px-0">
                {programs.filter(p => p.categoryId === activeTab).map(prog => (
                   <div key={prog.id} onClick={() => setSelectedProg(prog)} className="group cursor-pointer">
                      <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video mb-3 border border-slate-800 group-hover:border-slate-500">
                        <img src={`https://img.youtube.com/vi/${prog.youtubeId}/maxresdefault.jpg`} onError={(e) => { e.target.src = `https://img.youtube.com/vi/${prog.youtubeId}/hqdefault.jpg`; }} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="thumb"/>
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80 z-10" />
                        
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 z-20">
                          <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center pl-1"><Play fill="white" size={20} className="text-white"/></div>
                        </div>
                        
                        {(prog.publishedAt || prog.createdAt) && (
                          <div className="absolute bottom-2 left-2 bg-slate-900/90 border border-slate-700 backdrop-blur-md px-2 py-1 rounded text-[9px] text-slate-200 font-bold uppercase tracking-widest z-30 flex items-center gap-1">
                            <Calendar size={8} className="text-indigo-400" />
                            {new Date(prog.publishedAt || prog.createdAt).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short', year: 'numeric'})}
                          </div>
                        )}

                        <button onClick={(e) => { e.stopPropagation(); removeProgram(prog.id); }} className="absolute top-2 right-2 p-2 bg-slate-900/90 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 z-40 shadow-lg"><Trash2 size={12} /></button>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 truncate">{decodeHTML(prog.creatorName)}</span>
                      <h3 className="font-semibold text-slate-100 text-sm leading-snug line-clamp-2" title={decodeHTML(prog.title)}>{decodeHTML(prog.title)}</h3>
                   </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* --- MODAL LECTEUR --- */}
      {selectedProg && (
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-sm flex flex-col md:flex-row items-center justify-center p-0 md:p-10">
          <button onClick={() => setSelectedProg(null)} className="absolute top-6 right-6 md:top-10 md:right-10 text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-all z-50 backdrop-blur-md">
            <X size={24} />
          </button>
          
          <div className="w-full h-[30vh] md:h-[80vh] md:w-[70vw] bg-black md:rounded-2xl overflow-hidden shadow-2xl flex-shrink-0">
            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${selectedProg.youtubeId}?autoplay=1`} frameBorder="0" allowFullScreen title="YouTube"></iframe>
          </div>
          
          <div className="w-full flex-1 p-6 md:p-10 text-left overflow-y-auto">
            <span className="text-indigo-400 font-bold text-xs uppercase tracking-widest bg-indigo-500/10 px-3 py-1.5 rounded-full mb-4 inline-block">{decodeHTML(selectedProg.creatorName)}</span>
            <h2 className="text-2xl md:text-4xl font-bold text-white leading-tight mb-6">{decodeHTML(selectedProg.title)}</h2>
          </div>
        </div>
      )}

      {isAdminOpen && <AdminPanel onClose={() => setIsAdminOpen(false)} />}
    </div>
  );
}
