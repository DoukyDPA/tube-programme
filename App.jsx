import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { 
  Star, Cpu, BookOpen, Trophy, Mic2, Home, Sparkles, X, Trash2, Lock, AlertCircle, Settings, CheckCircle2, ServerCrash
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
  { id: 'ia', label: 'IA / Tech', icon: <Cpu size={18}/> },
  { id: 'lecture', label: 'Culture / Livres', icon: <BookOpen size={18}/> },
  { id: 'foot', label: 'Analyse Foot', icon: <Trophy size={18}/> },
  { id: 'interviews', label: 'Talks / Débats', icon: <Mic2 size={18}/> },
];

// --- COMPOSANT : PANNEAU DE CURATION ---

const AdminPanel = ({ onClose }) => {
  const [passInput, setPassInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('ia');

  const checkPass = () => {
    if (passInput === ADMIN_PASS) setIsUnlocked(true);
    else alert("Code erroné");
  };

  const fetchChannel = async () => {
    if (!YOUTUBE_API_KEY) return alert("❌ Clé API YouTube manquante sur Vercel !");
    setLoading(true);
    try {
      let cid = channelInput.trim();
      if (cid.startsWith('@')) {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=${cid}&part=id`);
        const data = await res.json();
        if (data.items?.length > 0) cid = data.items[0].id;
        else throw new Error("Chaîne introuvable sur YouTube.");
      }
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${cid}&part=snippet,id&order=date&maxResults=5&type=video`);
      const vData = await vRes.json();
      if (!vData.items) throw new Error("Aucune vidéo trouvée ou API désactivée.");
      setVideos(vData.items.map(v => ({ ...v, pitch: "", added: false })));
    } catch (e) { 
      alert("Erreur Recherche YouTube : " + e.message); 
    }
    finally { setLoading(false); }
  };

  const integrate = async (v, idx) => {
    if (!db) return alert("❌ Base de données Firebase non connectée.");
    try {
      const id = crypto.randomUUID();
      const publishedTimestamp = new Date(v.snippet.publishedAt).getTime();

      await setDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', id), {
        id,
        youtubeId: v.id.videoId,
        title: v.snippet.title,
        creatorName: v.snippet.channelTitle,
        categoryId: category,
        pitch: v.pitch || "",
        createdAt: Date.now(),
        publishedAt: publishedTimestamp,
        avgScore: 0
      });
      
      const newVids = [...videos];
      newVids[idx].added = true;
      setVideos(newVids);
      console.log("Succès de l'enregistrement !");
      
    } catch (e) { 
      alert(`❌ ERREUR DE SAUVEGARDE :\n\n${e.message}\n\n👉 Allez sur la Console Firebase > Firestore Database > Règles (Rules) et assurez-vous que c'est bien réglé sur : allow read, write: if true;`); 
    }
  };

  const integrateAll = async () => {
    const notAdded = videos.filter(v => !v.added);
    for (const v of notAdded) {
      const idx = videos.indexOf(v);
      await integrate(v, idx);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950/98 flex items-center justify-center p-6 backdrop-blur-md">
        <div className="w-full max-w-sm bg-slate-900 p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl text-center">
          <Lock className="mx-auto mb-6 text-indigo-500" size={32} />
          <h2 className="text-xl font-black mb-6 uppercase text-white tracking-tight">Accès Curation</h2>
          <input type="password" placeholder="Code secret" className="w-full bg-slate-800 p-4 rounded-2xl mb-4 text-center text-white outline-none ring-2 ring-transparent focus:ring-indigo-500" value={passInput} onChange={e => setPassInput(e.target.value)} />
          <button onClick={checkPass} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-500">Déverrouiller</button>
          <button onClick={onClose} className="mt-6 text-slate-500 text-xs hover:text-white">Retour au site</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4 lg:p-12">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-[3rem] p-8 lg:p-12 shadow-2xl flex flex-col max-h-[95vh]">
        <div className="flex justify-between items-center mb-8 shrink-0">
          <h2 className="text-3xl font-black text-white uppercase italic flex items-center gap-4 tracking-tighter">
            <Settings className="text-indigo-500" /> Curation Master
          </h2>
          <button onClick={onClose} className="p-3 bg-slate-800 rounded-full text-slate-400 hover:text-white"><X /></button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 overflow-hidden">
          {/* Colonne Recherche */}
          <div className="lg:w-1/3 shrink-0 space-y-6">
             <div className="space-y-3">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Thématique Cible</label>
               <select className="w-full bg-slate-800 p-4 rounded-2xl text-sm border-none outline-none text-white focus:ring-2 focus:ring-indigo-500" value={category} onChange={e => setCategory(e.target.value)}>
                 {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
               </select>
             </div>
             <div className="space-y-3">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Handle YouTube</label>
               <div className="flex flex-col gap-3">
                 <input className="w-full bg-slate-800 p-4 rounded-2xl text-sm outline-none text-white focus:ring-2 focus:ring-indigo-500" placeholder="@MonsieurPhi" value={channelInput} onChange={e => setChannelInput(e.target.value)} />
                 <button onClick={fetchChannel} disabled={loading} className="w-full bg-indigo-600 py-4 rounded-2xl font-black text-xs text-white uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-50">
                   {loading ? "Recherche..." : "Scanner la chaîne"}
                 </button>
               </div>
             </div>
             
             {videos.length > 0 && videos.some(v => !v.added) && (
               <div className="pt-6 mt-6 border-t border-slate-800">
                  <button onClick={integrateAll} className="w-full bg-emerald-600 py-4 rounded-2xl font-black text-xs text-white uppercase tracking-widest hover:bg-emerald-500 flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                    <CheckCircle2 size={16} /> Tout intégrer d'un coup
                  </button>
               </div>
             )}
          </div>

          {/* Colonne Résultats */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 no-scrollbar">
              {videos.length === 0 && !loading && (
                  <div className="h-full min-h-[300px] flex items-center justify-center border-2 border-dashed border-slate-800 rounded-[2rem] text-slate-500 text-sm">
                    Recherchez une chaîne pour voir les 5 dernières vidéos.
                  </div>
              )}
              {videos.map((v, i) => (
                <div key={i} className={`p-4 rounded-3xl border transition-all flex flex-col gap-4 ${v.added ? 'bg-emerald-500/10 border-emerald-500/20 opacity-70' : 'bg-slate-800/40 border-slate-700'}`}>
                  <div className="flex items-start gap-4">
                    <img src={v.snippet.thumbnails.medium?.url} className="w-32 aspect-video object-cover rounded-xl shadow-lg" alt="Miniature" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white leading-tight mb-2 line-clamp-2">{v.snippet.title}</h4>
                      <p className="text-[10px] text-slate-500 uppercase font-black">{v.snippet.channelTitle}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <input className="flex-1 bg-slate-950/50 p-3 rounded-xl text-[10px] outline-none italic text-white placeholder:text-slate-700" placeholder="Pitch (Totalement Optionnel)..." value={v.pitch} onChange={e => { const n = [...videos]; n[i].pitch = e.target.value; setVideos(n); }} disabled={v.added} />
                    <button onClick={() => integrate(v, i)} disabled={v.added} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${v.added ? 'bg-emerald-600 text-white' : 'bg-white text-black hover:bg-indigo-400'}`}>
                      {v.added ? "Intégré ✓" : "Intégrer"}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [activeTab, setActiveTab] = useState('accueil');
  const [selectedProg, setSelectedProg] = useState(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth)
      .catch((error) => setAuthError(error.message));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrograms(data.sort((a,b) => {
        const timeA = a.publishedAt || a.createdAt || 0;
        const timeB = b.publishedAt || b.createdAt || 0;
        return timeB - timeA;
      }));
    }, (err) => {
      console.error("Erreur Snapshot Firebase:", err);
      setAuthError("Permission Firebase refusée. Vérifiez les règles.");
    });
    return () => unsub();
  }, [user]);

  const removeProgram = async (id) => {
    if (confirm("Supprimer ce programme ?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', id));
      } catch(e) { alert("❌ Erreur suppression : " + e.message); }
    }
  };

  const filtered = useMemo(() => {
    return activeTab === 'accueil' ? programs : programs.filter(p => p.categoryId === activeTab);
  }, [programs, activeTab]);

  if (!firebaseConfig.apiKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8 text-white">
        <div className="max-w-md bg-slate-900 p-12 rounded-[3rem] border border-indigo-500/20 text-center shadow-2xl">
          <AlertCircle size={48} className="mx-auto mb-6 text-indigo-500" />
          <h2 className="text-xl font-black mb-4 uppercase italic">V0 Non Configurée</h2>
          <p className="text-slate-400 text-sm">Créez votre fichier .env et relancez.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-72 bg-slate-950/80 backdrop-blur-xl border-r border-slate-800/40 fixed h-full flex flex-col z-50">
        <div className="p-10 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg"><Sparkles size={20} className="text-white" /></div>
          <h1 className="text-xl font-black uppercase italic text-white tracking-tighter">Tube<span className="text-indigo-500">Prog</span></h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button onClick={() => setActiveTab('accueil')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === 'accueil' ? 'bg-indigo-600/20 text-indigo-400 font-bold' : 'text-slate-400 hover:bg-slate-800/30'}`}><Home size={18} /> <span className="text-sm">La Grille Hebdo</span></button>
          <div className="mt-10 mb-4 px-6 text-[10px] font-black text-slate-600 uppercase tracking-widest">Thématiques</div>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveTab(cat.id)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === cat.id ? 'bg-indigo-600/20 text-indigo-400 font-bold' : 'text-slate-400 hover:bg-slate-800/30'}`}>
              <span className={activeTab === cat.id ? 'text-indigo-400' : 'text-slate-500'}>{cat.icon}</span><span className="text-sm">{cat.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-8">
          <button onClick={() => setIsAdminOpen(true)} className="w-full py-4 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-all flex items-center justify-center gap-3">
            <Lock size={14} /> Admin Curation
          </button>
        </div>
      </aside>

      {/* --- MAIN AREA --- */}
      {/* Restriction forte de la zone principale pour empêcher tout débordement de taille */}
      <main className="ml-72 flex-1 p-12 overflow-x-hidden w-[calc(100vw-18rem)]">
        <header className="mb-16 flex justify-between items-start">
          <div>
            <h2 className="text-7xl font-black text-white uppercase italic leading-none mb-4 tracking-tighter">{activeTab === 'accueil' ? "À l'affiche" : CATEGORIES.find(c => c.id === activeTab).label}</h2>
            <p className="text-slate-500 font-medium text-xl italic tracking-tight border-l-4 border-indigo-500 pl-6">Le savoir sélectionné pour vous.</p>
          </div>
          {/* Indicateur d'état de la base de données pour vous aider à diagnostiquer */}
          <div className="text-right">
             <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-2">Base de données</span>
             {authError ? (
               <span className="text-red-500 font-bold flex items-center gap-2 text-xs bg-red-500/10 px-3 py-1.5 rounded-full"><ServerCrash size={14} /> Erreur Permissions</span>
             ) : user ? (
               <span className="text-emerald-500 font-bold flex items-center gap-2 text-xs bg-emerald-500/10 px-3 py-1.5 rounded-full"><CheckCircle2 size={14} /> Connecté</span>
             ) : (
               <span className="text-amber-500 font-bold flex items-center gap-2 text-xs bg-amber-500/10 px-3 py-1.5 rounded-full">Connexion...</span>
             )}
          </div>
        </header>

        {/* --- LA GRILLE DE VIGNETTES --- */}
        <div className="flex gap-8 overflow-x-auto pb-20 no-scrollbar items-start">
          {filtered.map(prog => (
            /* 🔥 CORRECTION TAILLE INCASSABLE ICI 🔥 */
            /* J'utilise style={{ width: 320, minWidth: 320 }} pour interdire au navigateur d'agrandir la carte */
            <div 
              key={prog.id} 
              className="group animate-in fade-in zoom-in-95 duration-500 relative flex-col shrink-0"
              style={{ width: '320px', minWidth: '320px', flexShrink: 0 }}
            >
              {/* Image Container */}
              <div 
                className="relative aspect-video rounded-[2.5rem] overflow-hidden border border-slate-800 group-hover:border-indigo-500 transition-all duration-500 shadow-2xl cursor-pointer bg-slate-900 w-full"
                onClick={() => setSelectedProg(prog)}
              >
                <img 
                  src={`https://img.youtube.com/vi/${prog.youtubeId}/maxresdefault.jpg`} 
                  onError={(e) => { e.target.onerror = null; e.target.src = `https://img.youtube.com/vi/${prog.youtubeId}/hqdefault.jpg`; }}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                  alt="Thumbnail" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent opacity-80" />
                
                {/* Bouton Poubelle */}
                <button onClick={(e) => { e.stopPropagation(); removeProgram(prog.id); }} className="absolute top-4 right-4 p-3 bg-red-600/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg"><Trash2 size={14} /></button>
                
                {/* Badges Date et Note */}
                <div className="absolute bottom-5 left-5 bg-indigo-600/90 backdrop-blur-md px-3 py-1 rounded-lg text-[9px] text-white font-bold uppercase tracking-widest shadow-lg">
                  {new Date(prog.publishedAt || prog.createdAt).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})}
                </div>
                <div className="absolute bottom-5 right-5 bg-slate-950/80 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[10px] text-indigo-300 font-bold uppercase tracking-widest shadow-lg">★ {prog.avgScore?.toFixed(1) || "N/A"}</div>
              </div>
              
              {/* Textes en dessous */}
              <div className="mt-6 px-2 w-full">
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-2 truncate">{prog.creatorName}</span>
                <h3 className="text-xl font-bold text-white leading-tight group-hover:text-indigo-400 transition-colors line-clamp-2 italic tracking-tighter" title={prog.title}>{prog.title}</h3>
                {prog.pitch && <p className="text-slate-500 text-xs mt-4 line-clamp-2 italic border-l border-slate-800 pl-4 leading-relaxed font-medium">"{prog.pitch}"</p>}
              </div>
            </div>
          ))}
          
          {filtered.length === 0 && (
            <div className="w-full border-2 border-dashed border-slate-800 rounded-[4rem] p-32 text-center flex flex-col items-center">
              <p className="text-slate-600 font-black uppercase tracking-widest text-xs mb-8 italic">Grille vide.</p>
              <button onClick={() => setIsAdminOpen(true)} className="text-indigo-400 font-black uppercase italic underline decoration-2 underline-offset-8 hover:text-white transition-all">Accéder à la curation →</button>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL LECTEUR --- */}
      {selectedProg && (
        <div className="fixed inset-0 z-[60] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-12">
          <button onClick={() => setSelectedProg(null)} className="absolute top-10 right-10 text-slate-500 border border-slate-800 px-8 py-3 rounded-full uppercase text-[10px] font-black tracking-widest hover:text-white transition-all shadow-xl">Fermer [X]</button>
          <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-3 gap-16 items-center">
            <div className="lg:col-span-2 aspect-video bg-black rounded-[3.5rem] overflow-hidden shadow-2xl border border-white/5 shadow-indigo-500/10">
              <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${selectedProg.youtubeId}?autoplay=1`} frameBorder="0" allowFullScreen title="YouTube"></iframe>
            </div>
            <div className="lg:col-span-1">
              <span className="text-indigo-400 font-black text-[10px] uppercase tracking-widest bg-indigo-500/10 px-4 py-2 rounded-full mb-8 inline-block italic tracking-tighter">{selectedProg.creatorName}</span>
              <h2 className="text-5xl font-black text-white leading-[1.1] mb-8 italic tracking-tighter">{selectedProg.title}</h2>
              {selectedProg.pitch && <p className="text-slate-400 italic text-xl leading-relaxed border-l-4 border-indigo-500/50 pl-8 mb-12">"{selectedProg.pitch}"</p>}
            </div>
          </div>
        </div>
      )}

      {isAdminOpen && <AdminPanel onClose={() => setIsAdminOpen(false)} />}
    </div>
  );
}
