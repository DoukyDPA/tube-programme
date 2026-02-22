import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  Play, 
  Star, 
  Cpu, 
  BookOpen, 
  Trophy, 
  Mic2, 
  Home,
  LayoutGrid,
  Sparkles,
  Search,
  X,
  Trash2,
  Send,
  Lock,
  PlusCircle,
  AlertCircle,
  Settings,
  Edit2,
  CheckCircle2,
  Save
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
const FIREBASE_APP_ID = "tube-prog-v1";

let db, auth;
if (firebaseConfig.apiKey) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) { console.error("Firebase init error:", error); }
}

const CATEGORIES = [
  { id: 'ia', label: 'IA / Tech', icon: <Cpu size={18}/> },
  { id: 'lecture', label: 'Culture / Livres', icon: <BookOpen size={18}/> },
  { id: 'foot', label: 'Analyse Foot', icon: <Trophy size={18}/> },
  { id: 'interviews', label: 'Talks / Débats', icon: <Mic2 size={18}/> },
];

// --- COMPOSANT : MODAL D'ÉDITION D'UN PROGRAMME ---
const EditProgramModal = ({ prog, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: prog.title,
    categoryId: prog.categoryId,
    pitch: prog.pitch || ""
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(prog.id, formData);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2"><Edit2 size={20} className="text-indigo-500" /> Modifier la publication</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Titre de la vidéo</label>
            <input required className="w-full bg-slate-800 p-4 rounded-xl text-sm text-white border-none focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Catégorie</label>
            <select className="w-full bg-slate-800 p-4 rounded-xl text-sm text-white border-none focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Pitch / Commentaire (Optionnel)</label>
            <textarea className="w-full bg-slate-800 p-4 rounded-xl text-sm text-white border-none focus:ring-2 focus:ring-indigo-500 outline-none h-24" placeholder="Aucun commentaire..." value={formData.pitch} onChange={e => setFormData({...formData, pitch: e.target.value})} />
          </div>
          <button type="submit" disabled={saving} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 mt-4">
            {saving ? "Sauvegarde..." : <><Save size={16} /> Enregistrer les modifications</>}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- COMPOSANT : PANNEAU DE CURATION ---

const AdminPanel = ({ onClose, isUnlocked, onUnlock }) => {
  const [passInput, setPassInput] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);

  const checkPass = () => {
    if (passInput === ADMIN_PASS) onUnlock();
    else alert("Code erroné");
  };

  const fetchChannel = async () => {
    if (!YOUTUBE_API_KEY) return alert("Clé API YouTube manquante.");
    setLoading(true);
    try {
      let cid = channelInput.trim();
      if (cid.startsWith('@')) {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=${cid}&part=id`);
        const data = await res.json();
        if (data.items?.length > 0) cid = data.items[0].id;
        else throw new Error("Chaîne introuvable.");
      }
      
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${cid}&part=snippet,id&order=date&maxResults=5&type=video`);
      const vData = await vRes.json();
      
      // Initialise chaque vidéo avec la catégorie 'ia' par défaut et un pitch vide
      setVideos(vData.items?.map(v => ({ ...v, pitch: "", categoryId: 'ia', added: false })) || []);
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const updateVideoField = (index, field, value) => {
    const newVids = [...videos];
    newVids[index][field] = value;
    setVideos(newVids);
  };

  const integrateOne = async (v, idx) => {
    if (!db) return;
    try {
      const id = crypto.randomUUID();
      const publishedTimestamp = new Date(v.snippet.publishedAt).getTime();

      await setDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', id), {
        id, 
        youtubeId: v.id.videoId, 
        title: v.snippet.title,
        creatorName: v.snippet.channelTitle, 
        categoryId: v.categoryId, // Utilise la catégorie choisie spécifiquement pour cette vidéo
        pitch: v.pitch || "", 
        createdAt: Date.now(), 
        publishedAt: publishedTimestamp,
        avgScore: 0
      });
      updateVideoField(idx, 'added', true);
    } catch (e) { alert("Erreur d'écriture Firebase."); }
  };

  const integrateAll = async () => {
    const notAdded = videos.filter(v => !v.added);
    for (const v of notAdded) {
      const idx = videos.indexOf(v);
      await integrateOne(v, idx);
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
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-[3rem] p-8 lg:p-10 shadow-2xl flex flex-col max-h-[95vh]">
        <div className="flex justify-between items-center mb-8 flex-shrink-0">
          <h2 className="text-3xl font-black text-white uppercase italic flex items-center gap-4 tracking-tighter">
            <Settings className="text-indigo-500" /> Curation Master
          </h2>
          <button onClick={onClose} className="p-3 bg-slate-800 rounded-full text-slate-400 hover:text-white"><X /></button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 overflow-hidden">
          
          {/* Colonne de Recherche */}
          <div className="lg:w-1/3 flex-shrink-0 space-y-6 bg-slate-950/50 p-6 rounded-[2rem] border border-slate-800/50 h-fit">
             <div className="space-y-3">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Handle YouTube</label>
               <input className="w-full bg-slate-800 p-4 rounded-2xl text-sm outline-none text-white focus:ring-2 focus:ring-indigo-500" placeholder="ex: @MonsieurPhi" value={channelInput} onChange={e => setChannelInput(e.target.value)} />
             </div>
             <button onClick={fetchChannel} disabled={loading} className="w-full bg-indigo-600 py-4 rounded-2xl font-black text-xs text-white uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-50 flex justify-center items-center gap-2">
                <Search size={16} /> {loading ? "Recherche..." : "Scanner les nouveautés"}
             </button>
             
             {videos.length > 0 && videos.some(v => !v.added) && (
               <div className="pt-6 mt-6 border-t border-slate-800">
                  <button onClick={integrateAll} className="w-full bg-emerald-600 py-4 rounded-2xl font-black text-xs text-white uppercase tracking-widest hover:bg-emerald-500 flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                    <CheckCircle2 size={16} /> Tout intégrer d'un coup
                  </button>
               </div>
             )}
          </div>

          {/* Colonne des Résultats */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 no-scrollbar pb-10">
              {videos.length === 0 && !loading && (
                  <div className="h-full min-h-[300px] flex items-center justify-center border-2 border-dashed border-slate-800 rounded-[2rem] text-slate-500 text-sm">
                    Recherchez une chaîne pour voir ses dernières vidéos.
                  </div>
              )}
              
              {videos.map((v, i) => (
                <div key={i} className={`p-4 rounded-3xl border transition-all ${v.added ? 'bg-emerald-500/10 border-emerald-500/20 opacity-70' : 'bg-slate-800/40 border-slate-700 hover:border-indigo-500/50'}`}>
                  <div className="flex flex-col sm:flex-row gap-4">
                    
                    {/* Miniature & Titre */}
                    <div className="flex-1 flex items-start gap-4">
                      <img src={v.snippet.thumbnails.medium?.url} className="w-32 aspect-video object-cover rounded-xl shadow-lg" alt="Miniature" />
                      <div>
                        <h4 className="text-sm font-bold text-white leading-tight mb-2 line-clamp-2">{v.snippet.title}</h4>
                        <div className="flex items-center gap-2">
                           <p className="text-[10px] text-slate-500 uppercase font-black">{v.snippet.channelTitle}</p>
                           <p className="text-[9px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md">{new Date(v.snippet.publishedAt).toLocaleDateString('fr-FR')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Paramètres d'import */}
                    <div className="sm:w-64 flex flex-col gap-2 shrink-0">
                      <select 
                        className="w-full bg-slate-900 p-2.5 rounded-lg text-xs text-slate-300 border border-slate-800 outline-none focus:border-indigo-500" 
                        value={v.categoryId} 
                        onChange={e => updateVideoField(i, 'categoryId', e.target.value)}
                        disabled={v.added}
                      >
                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      
                      <textarea 
                        className="w-full bg-slate-900 p-2.5 rounded-lg text-xs text-slate-300 border border-slate-800 outline-none focus:border-indigo-500 h-16 resize-none placeholder:text-slate-600" 
                        placeholder="Pitch (Totalement optionnel)..." 
                        value={v.pitch} 
                        onChange={e => updateVideoField(i, 'pitch', e.target.value)}
                        disabled={v.added}
                      />
                      
                      <button 
                        onClick={() => integrateOne(v, i)} 
                        disabled={v.added} 
                        className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${v.added ? 'bg-emerald-600 text-white' : 'bg-white text-black hover:bg-indigo-400 active:scale-95'}`}
                      >
                        {v.added ? "Vidéo Intégrée ✓" : "Intégrer"}
                      </button>
                    </div>
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
  const [programs, setPrograms] = useState([]);
  const [activeTab, setActiveTab] = useState('accueil');
  const [selectedProg, setSelectedProg] = useState(null);
  
  // État d'administration global
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [editingProg, setEditingProg] = useState(null);

  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth);
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrograms(data.sort((a,b) => {
        const timeA = a.publishedAt || a.createdAt || 0;
        const timeB = b.publishedAt || b.createdAt || 0;
        return timeB - timeA;
      }));
    });
  }, [user]);

  const removeProgram = async (id) => {
    if (confirm("Voulez-vous supprimer ce programme de la grille ?")) {
      await deleteDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', id));
    }
  };

  const handleEditSave = async (id, data) => {
    try {
      await updateDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', id), data);
      setEditingProg(null); // Ferme le modal
    } catch (e) {
      alert("Erreur lors de la modification.");
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
          <h2 className="text-xl font-black mb-4 uppercase italic tracking-tighter">Configuration Requise</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">Veuillez configurer votre fichier .env avec vos clés Firebase et YouTube.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex font-sans selection:bg-indigo-500/30">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-72 bg-slate-950/80 backdrop-blur-xl border-r border-slate-800/40 fixed h-full flex flex-col z-50">
        <div className="p-10 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20"><Sparkles size={20} className="text-white" /></div>
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
            {isAdminUnlocked ? <><Settings size={14} className="text-emerald-500" /> Curation Master</> : <><Lock size={14} /> Accès Admin</>}
          </button>
        </div>
      </aside>

      {/* --- MAIN GRID --- */}
      <main className="ml-72 flex-1 p-12">
        <header className="mb-16">
          <h2 className="text-7xl font-black text-white uppercase italic leading-none mb-4 tracking-tighter">{activeTab === 'accueil' ? "À l'affiche" : CATEGORIES.find(c => c.id === activeTab).label}</h2>
          <p className="text-slate-500 font-medium text-xl italic tracking-tight border-l-4 border-indigo-500 pl-6">Le savoir sélectionné pour vous.</p>
        </header>

        <div className="flex gap-10 overflow-x-auto pb-20 no-scrollbar">
          {filtered.map(prog => (
            <div key={prog.id} className="flex-shrink-0 w-84 group animate-in fade-in zoom-in-95 duration-500 relative">
              
              {/* Image & Boutons rapides (Admin) */}
              <div 
                className="relative aspect-video rounded-[2.5rem] overflow-hidden border border-slate-800 group-hover:border-indigo-500 transition-all duration-500 shadow-2xl cursor-pointer"
                onClick={() => setSelectedProg(prog)}
              >
                <img src={`https://img.youtube.com/vi/${prog.youtubeId}/maxresdefault.jpg`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="Thumbnail" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent opacity-80" />
                
                {/* Outils d'édition (Visible uniquement si déverrouillé) */}
                {isAdminUnlocked && (
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={(e) => { e.stopPropagation(); setEditingProg(prog); }} className="p-3 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-full shadow-lg hover:scale-110 transition-transform"><Edit2 size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); removeProgram(prog.id); }} className="p-3 bg-red-600/90 hover:bg-red-500 text-white rounded-full shadow-lg hover:scale-110 transition-transform"><Trash2 size={14} /></button>
                  </div>
                )}

                <div className="absolute bottom-5 left-5 bg-indigo-600/90 backdrop-blur-md px-3 py-1 rounded-lg text-[9px] text-white font-bold uppercase tracking-widest shadow-lg">
                  {new Date(prog.publishedAt || prog.createdAt).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})}
                </div>
              </div>
              
              {/* Infos Texte */}
              <div className="mt-6 px-2">
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-2">{prog.creatorName}</span>
                <h3 className="text-xl font-bold text-white leading-tight group-hover:text-indigo-400 transition-colors line-clamp-2 italic tracking-tighter cursor-pointer" onClick={() => setSelectedProg(prog)}>{prog.title}</h3>
                {prog.pitch && <p className="text-slate-500 text-xs mt-4 line-clamp-2 italic border-l border-slate-800 pl-4 leading-relaxed font-medium">"{prog.pitch}"</p>}
              </div>
            </div>
          ))}
          
          {filtered.length === 0 && (
            <div className="w-full border-2 border-dashed border-slate-800 rounded-[4rem] p-32 text-center flex flex-col items-center">
              <p className="text-slate-600 font-black uppercase tracking-widest text-xs mb-8 italic">Grille vide ou thématique sans programme.</p>
              <button onClick={() => setIsAdminOpen(true)} className="text-indigo-400 font-black uppercase italic underline decoration-2 underline-offset-8 hover:text-white transition-all">Accéder à la curation →</button>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL PLAYER --- */}
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
              <button className="w-full bg-white text-slate-950 py-5 rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-indigo-400 transition-all flex items-center justify-center gap-3 shadow-xl italic tracking-tighter"><Star size={16} /> Évaluer l'expertise</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS ADMIN --- */}
      {isAdminOpen && (
        <AdminPanel 
          onClose={() => setIsAdminOpen(false)} 
          isUnlocked={isAdminUnlocked}
          onUnlock={() => setIsAdminUnlocked(true)}
        />
      )}

      {editingProg && (
        <EditProgramModal 
          prog={editingProg} 
          onClose={() => setEditingProg(null)} 
          onSave={handleEditSave} 
        />
      )}
    </div>
  );
}
