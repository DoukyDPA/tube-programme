import React, { useState } from 'react';
import { Cpu, BookOpen, Trophy, Mic2, X, Settings, Plus, Youtube, CheckCircle2, Loader2 } from 'lucide-react';
import { db, FIREBASE_APP_ID } from '../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

const ICONS = [
  { id: 'ia', icon: <Cpu size={18}/> },
  { id: 'lecture', icon: <BookOpen size={18}/> },
  { id: 'foot', icon: <Trophy size={18}/> },
  { id: 'interviews', icon: <Mic2 size={18}/> }
];

export default function AdminPanel({ user, userData, onClose }) {
  const [tab, setTab] = useState('channel'); // 'channel' ou 'theme'
  const [loading, setLoading] = useState(false);
  
  // États pour nouveau thème
  const [themeName, setThemeName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('ia');

  // États pour nouvelle chaîne (existant)
  const [channelInput, setChannelInput] = useState('');
  const [category, setCategory] = useState('ia');

  const handleCreateTheme = async () => {
  if (!themeName.trim()) return;
  setLoading(true);
  try {
    // On crée une référence pour le nouveau thème dans la sous-collection "themes" de l'utilisateur
    const themeRef = doc(collection(db, 'users', user.uid, 'themes'));
    
    await setDoc(themeRef, {
      name: themeName,
      icon: selectedIcon,
      createdAt: Date.now()
    });

    alert("Thématique créée avec succès !");
    onClose();
  } catch (e) { 
    alert(e.message); 
  } finally { 
    setLoading(false); 
  }
};

  // La fonction fetchAndAutoIntegrate reste identique à votre App.jsx originale
  // mais utilise les props 'category' et 'channelInput'

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="flex border-b border-slate-800">
          <button onClick={() => setTab('channel')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest ${tab === 'channel' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500'}`}>
            + Ajouter Chaîne
          </button>
          <button onClick={() => setTab('theme')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest ${tab === 'theme' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500'}`}>
            + Créer Thème
          </button>
          <button onClick={onClose} className="p-4 text-slate-500 hover:text-white"><X size={20}/></button>
        </div>

        <div className="p-8">
          {tab === 'theme' ? (
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Nom de la thématique</label>
                <input className="w-full bg-slate-800 p-4 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500" value={themeName} onChange={e => setThemeName(e.target.value)} placeholder="Ex: Science & Espace" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Icône</label>
                <div className="flex gap-4">
                  {ICONS.map(i => (
                    <button key={i.id} onClick={() => setSelectedIcon(i.id)} className={`p-4 rounded-xl border-2 transition-all ${selectedIcon === i.id ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-slate-800 text-slate-500'}`}>
                      {i.icon}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleCreateTheme} disabled={loading} className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-white hover:bg-indigo-500 disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin mx-auto" size={20}/> : 'Créer ma thématique'}
              </button>
            </div>
          ) : (
            /* Contenu de l'ancien AdminPanel pour les chaînes */
            <div className="space-y-6">
               {/* ... (votre formulaire existant : choix catégorie + input @chaîne) */}
               <button onClick={() => {/* fetchAndAutoIntegrate */}} className="w-full bg-emerald-600 py-4 rounded-xl font-bold text-white">
                 Ajouter la chaîne
               </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
