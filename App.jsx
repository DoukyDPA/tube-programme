import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, query, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { 
  Play, 
  ChevronRight, 
  ChevronLeft, 
  Star, 
  Cpu, 
  BookOpen, 
  Trophy, 
  Mic2, 
  Home,
  CheckCircle2,
  LayoutGrid,
  Sparkles,
  Search,
  Plus,
  Settings,
  X,
  Trash2,
  Send,
  Lock
} from 'lucide-react';

/**
 * 🛠 CONFIGURATION FIREBASE
 * -------------------------------------------------------------------------
 * POUR VOTRE PRODUCTION : Remplacez la ligne 'const firebaseConfig = ...' 
 * par l'objet JSON que vous trouverez dans votre console Firebase.
 * -------------------------------------------------------------------------
 */
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "VOTRE_API_KEY_ICI",
      authDomain: "votre-projet.firebaseapp.com",
      projectId: "votre-projet",
      storageBucket: "votre-projet.appspot.com",
      messagingSenderId: "VOTRE_ID",
      appId: "VOTRE_APP_ID"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'tube-prog-v0';

// Thématiques de départ
const THEMES = [
  { id: 'ia', label: 'IA', icon: <Cpu size={18}/>, color: 'indigo' },
  { id: 'lecture', label: 'Lecture', icon: <BookOpen size={18}/>, color: 'purple' },
  { id: 'foot', label: 'Football', icon: <Trophy size={18}/>, color: 'emerald' },
  { id: 'interviews', label: 'Interviews', icon: <Mic2 size={18}/>, color: 'rose' },
];

/**
 * COMPOSANT : Carte de Programme
 */
const ProgramCard = ({ program, onSelect, isAdmin, onDelete }) => (
  <div 
    onClick={() => onSelect(program)}
    className="flex-shrink-0 w-80 bg-slate-900/40 backdrop-blur-sm rounded-2xl overflow-hidden cursor-pointer border border-slate-800/50 hover:border-indigo-500/50 hover:bg-slate-800/60 transition-all duration-500 group relative"
  >
    {isAdmin && (
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(program.id); }}
        className="absolute top-3 right-3 z-10 p-2 bg-red-500/20 text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
      >
        <Trash2 size={14} />
      </button>
    )}
    <div className="relative aspect-video overflow-hidden">
      <img 
        src={`https://img.youtube.com/vi/${program.youtubeId}/maxresdefault.jpg`} 
        onError={(e) => e.target.src = `https://img.youtube.com/vi/${program.youtubeId}/hqdefault.jpg`}
        alt={program.title} 
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-60" />
      
      {program.status === 'live' && (
        <span className="absolute top-3 left-3 bg-rose-500 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-tighter shadow-lg shadow-rose-500/20">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Direct
        </span>
      )}
      
      <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-md border border-white/10 px-2 py-1 rounded-lg text-[10px] text-indigo-300 font-bold flex items-center gap-1">
        <Star size={12} className="fill-indigo-400 text-indigo-400" /> {program.avgScore ? program.avgScore.toFixed(1) : 'N/A'}
      </div>
    </div>
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
         <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
         <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{program.creatorName}</p>
      </div>
      <h3 className="text-slate-100 text-[15px] font-bold line-clamp-2 leading-snug mb-3 group-hover:text-indigo-300 transition-colors">{program.title}</h3>
      <p className="text-slate-500 text-[11px] leading-relaxed line-clamp-1 border-l border-slate-700 pl-3 italic">
        {program.pitch || "Aucun pitch pour ce programme."}
      </p>
    </div>
  </div>
);

/**
 * MODAL : Curation Administrateur
 */
const AdminPanel = ({ onClose, userId }) => {
  const [formData, setFormData] = useState({
    youtubeId: '',
    title: '',
    creatorName: '',
    categoryId: 'ia',
    pitch: '',
    status: 'archive'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId) return;
    const id = crypto.randomUUID();
    const progRef = doc(db, 'artifacts', appId, 'public', 'data', 'programs', id);
    await setDoc(progRef, {
      ...formData,
      id,
      ratingCount: 0,
      sumScores: 0,
      avgScore: 0,
      createdAt: Date.now()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[2.5rem] p-10 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3 uppercase italic">
            <Settings className="text-indigo-500" /> Curation Admin
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={24}/></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ID YouTube</label>
              <input required className="w-full bg-slate-800 border-none rounded-xl text-sm p-4 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="ex: dQw4w9WgXcQ" value={formData.youtubeId} onChange={(e) => setFormData({...formData, youtubeId: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Catégorie</label>
              <select className="w-full bg-slate-800 border-none rounded-xl text-sm p-4 focus:ring-2 focus:ring-indigo-500 transition-all appearance-none" value={formData.categoryId} onChange={(e) => setFormData({...formData, categoryId: e.target.value})}>
                {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Créateur</label>
            <input required className="w-full bg-slate-800 border-none rounded-xl text-sm p-4 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="ex: Henri ExplorIA" value={formData.creatorName} onChange={(e) => setFormData({...formData, creatorName: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Titre du Programme</label>
            <input required className="w-full bg-slate-800 border-none rounded-xl text-sm p-4 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="ex: Tout savoir sur GPT-5" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pitch (140 caractères)</label>
            <textarea maxLength={140} className="w-full bg-slate-800 border-none rounded-xl text-sm p-4 focus:ring-2 focus:ring-indigo-500 h-28" placeholder="Pourquoi est-ce une pépite ?" value={formData.pitch} onChange={(e) => setFormData({...formData, pitch: e.target.value})} />
          </div>
          <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-indigo-500 shadow-xl shadow-indigo-600/10 transition-all uppercase tracking-widest text-sm">
            <Send size={18} /> Publier sur la grille
          </button>
        </form>
      </div>
    </div>
  );
};

/**
 * APPLICATION PRINCIPALE
 */
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('accueil');
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);

  // Authentification initiale
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Écoute des programmes en temps réel
  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'programs');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const progs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPrograms(progs);
    }, (error) => console.error("Firestore Error:", error));
    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id) => {
    if (!window.confirm("Supprimer ce programme définitivement ?")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'programs', id));
  };

  const filteredPrograms = activeTab === 'accueil' 
    ? programs 
    : programs.filter(p => p.categoryId === activeTab);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex font-sans">
      
      {/* Sidebar - Navigation latérale */}
      <aside className="w-72 bg-slate-950/50 backdrop-blur-xl border-r border-slate-800/40 flex flex-col fixed h-full z-40">
        <div className="p-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Sparkles size={18} className="text-white" />
            </div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase italic">Tube<span className="text-indigo-500">Prog</span></h1>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] leading-tight italic">Curateurs de savoir</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <button 
            onClick={() => setActiveTab('accueil')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'accueil' ? 'bg-indigo-600/20 text-indigo-400 font-bold' : 'text-slate-400 hover:bg-slate-800/50'}`}
          >
            <LayoutGrid size={18}/>
            <span className="text-sm tracking-wide">La Grille Hebdo</span>
          </button>
          
          <div className="mt-12 mb-4 px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.25em]">Thématiques</div>
          {THEMES.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === cat.id ? 'bg-indigo-600/20 text-indigo-400 font-bold' : 'text-slate-400 hover:bg-slate-800/50'}`}
            >
              {cat.icon}
              <span className="text-sm tracking-wide">{cat.label}</span>
            </button>
          ))}
        </nav>

        {/* Administration & Statut */}
        <div className="p-8 space-y-4">
          <button 
            onClick={() => setShowAdmin(true)}
            className="w-full flex items-center justify-center gap-2 text-[10px] font-black text-slate-600 hover:text-indigo-400 transition-colors uppercase tracking-widest"
          >
            <Lock size={12} /> Curation Administrateur
          </button>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
             <div className="flex items-center gap-2 mb-2 text-indigo-400 font-black text-[10px] uppercase tracking-widest">
                <CheckCircle2 size={14}/> Mode Expert
             </div>
             <p className="text-[11px] text-slate-500 leading-snug">Évaluez pour influencer le classement.</p>
          </div>
        </div>
      </aside>

      {/* Contenu Principal */}
      <main className="ml-72 flex-1 pb-32">
        <div className="h-20 border-b border-slate-800/30 flex items-center justify-between px-10 sticky top-0 bg-[#020617]/80 backdrop-blur-md z-30">
           <div className="flex items-center gap-4 bg-slate-900/50 px-5 py-2.5 rounded-full border border-slate-800/50 w-96">
              <Search size={16} className="text-slate-500" />
              <input type="text" placeholder="Rechercher..." className="bg-transparent border-none text-xs focus:ring-0 w-full placeholder:text-slate-600" />
           </div>
           <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Édition</p>
                <p className="text-sm font-bold text-indigo-400 italic">Hebdomadaire</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-black text-indigo-400">
                {user?.uid.substring(0, 2).toUpperCase()}
              </div>
           </div>
        </div>

        <header className="p-10">
          <div className="mb-12">
            <h2 className="text-5xl font-black text-white tracking-tight mb-2">
              {activeTab === 'accueil' ? 'Cette semaine' : THEMES.find(t => t.id === activeTab)?.label}
            </h2>
            <p className="text-slate-500 font-medium tracking-wide">La sélection des titulaires validés pour votre plaisir.</p>
          </div>

          <section>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-1.5 h-6 bg-indigo-500 rounded-full shadow-[0_0_12px_rgba(79,70,229,0.5)]" />
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white italic tracking-widest">Sélection Prioritaire</h3>
            </div>
            
            {filteredPrograms.length > 0 ? (
              <div className="flex gap-8 overflow-x-auto pb-6 no-scrollbar">
                {filteredPrograms.map(prog => (
                  <ProgramCard 
                    key={prog.id} 
                    program={prog} 
                    onSelect={setSelectedProgram} 
                    isAdmin={true} 
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-slate-900/20 border-2 border-dashed border-slate-800/50 rounded-[2.5rem] p-24 text-center">
                 <p className="text-slate-600 font-bold uppercase tracking-[0.2em] text-[10px] mb-4">Aucun programme pour l'instant.</p>
                 <button onClick={() => setShowAdmin(true)} className="text-indigo-400 text-xs font-black uppercase tracking-widest hover:text-indigo-300 transition-colors flex items-center gap-2 mx-auto">
                   <Plus size={14} /> Ajouter la première pépite
                 </button>
              </div>
            )}
          </section>
        </header>

        {/* Lecteur Vidéo Plein Écran */}
        {selectedProgram && (
          <div className="fixed inset-0 z-[60] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-12">
            <button onClick={() => setSelectedProgram(null)} className="absolute top-10 right-10 text-slate-500 hover:text-white uppercase text-[10px] font-black tracking-[0.4em] border border-slate-800 px-8 py-3 rounded-full transition-all hover:bg-white/5">Quitter</button>
            <div className="max-w-6xl w-full grid grid-cols-3 gap-16 items-center">
              <div className="col-span-2">
                <div className="aspect-video bg-black rounded-[3rem] overflow-hidden shadow-2xl border border-white/5 shadow-indigo-500/10">
                  <iframe 
                    width="100%" height="100%" 
                    src={`https://www.youtube.com/embed/${selectedProgram.youtubeId}?autoplay=1`} 
                    title="Player Tube-Prog" frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                  ></iframe>
                </div>
              </div>
              <div className="col-span-1">
                <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase mb-6 inline-block tracking-widest">
                  {selectedProgram.creatorName}
                </span>
                <h2 className="text-4xl font-black text-white leading-tight mb-6">{selectedProgram.title}</h2>
                <p className="text-slate-400 text-lg leading-relaxed mb-10 italic border-l-2 border-indigo-500/50 pl-6">
                  "{selectedProgram.pitch}"
                </p>
                <div className="flex gap-4">
                  <button className="flex-1 bg-white text-black py-5 rounded-2xl font-black text-sm hover:bg-indigo-400 transition-all flex items-center justify-center gap-3 shadow-lg shadow-white/5">
                    <Star size={18} fill="black"/> NOTER L'EXPERTISE
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showAdmin && <AdminPanel userId={user?.uid} onClose={() => setShowAdmin(false)} />}
      </main>

      {/* Barre d'état flottante */}
      <div className="fixed bottom-8 left-[calc(72px+18rem)] right-10 h-16 bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl flex items-center justify-between px-10 z-30 shadow-2xl">
        <div className="flex gap-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.25em]">
          <span className="text-indigo-400 flex items-center gap-2 italic">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Direct & Récent
          </span>
          <span className="hover:text-slate-300 cursor-pointer transition-colors">Programmes de demain</span>
          <span className="hover:text-slate-300 cursor-pointer transition-colors italic">Numéro {new Date().getFullYear()}.01</span>
        </div>
        <div className="flex items-center gap-4">
           <div className="h-6 w-px bg-slate-800" />
           <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Build V0.1.0-Prod</p>
        </div>
      </div>
    </div>
  );
}
