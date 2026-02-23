import React, { useState } from 'react';
import { Cpu, BookOpen, Trophy, Mic2, X, Settings, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { db, FIREBASE_APP_ID, YOUTUBE_API_KEY } from '../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

const ICONS = [
  { id: 'ia', icon: <Cpu size={18}/> },
  { id: 'lecture', icon: <BookOpen size={18}/> },
  { id: 'foot', icon: <Trophy size={18}/> },
  { id: 'interviews', icon: <Mic2 size={18}/> },
  { id: 'custom', icon: <Sparkles size={18}/> }
];

const CATEGORIES = [
  { id: 'ia', label: 'IA & Tech' },
  { id: 'lecture', label: 'Culture & Livres' },
  { id: 'foot', label: 'Analyse Foot' },
  { id: 'interviews', label: 'Talks & Débats' },
];

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

export default function AdminPanel({ user, userData, customThemes = [], onClose }) {
  const [tab, setTab] = useState('channel');
  const [loading, setLoading] = useState(false);
  
  const [themeName, setThemeName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('ia');

  const [channelInput, setChannelInput] = useState('');
  const [category, setCategory] = useState('ia');

  const handleCreateTheme = async () => {
    if (!themeName.trim()) return;
    
    // VÉRIFICATION DE LA LIMITE DE 2 CATÉGORIES POUR LES COMPTES GRATUITS
    if (!userData?.isPremium && customThemes.length >= 2) {
      return alert("💎 Version Gratuite : Vous avez atteint la limite de 2 thématiques personnalisées.");
    }

    setLoading(true);
    try {
      const themeRef = doc(collection(db, 'users', user.uid, 'themes'));
      await setDoc(themeRef, { name: themeName, icon: selectedIcon, createdAt: Date.now() });
      
      // Mettre à jour le compteur dans le profil utilisateur
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { themeCount: customThemes.length + 1 }, { merge: true });

      alert("Thématique créée avec succès !");
      onClose();
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

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
      
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${cid}&part=snippet,id&order=date&maxResults=15&type=video`);
      const vData = await vRes.json();
      if (!vData.items || vData.items.length === 0) throw new Error("Aucune vidéo trouvée.");

      const videoIds = vData.items.map(v => v.id.videoId).join(',');
      const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails`);
      const detailsData = await detailsRes.json();

      // FILTRE : + de 3 minutes (180s) ET Limite stricte de 5 vidéos !
      const longVideos = vData.items.filter(v => {
        const detail = detailsData.items?.find(d => d.id === v.id.videoId);
        return detail && parseDuration(detail.contentDetails.duration) >= 180;
      }).slice(0, 5); // <-- LIMITE DE 5 ICI

      if (longVideos.length === 0) throw new Error("Aucune vidéo de plus de 3 minutes trouvée.");
      
      const promises = longVideos.map(v => {
        const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
        return setDoc(newDocRef, {
          id: newDocRef.id,
          youtubeId: v.id.videoId,
          channelId: cid, 
          title: decodeHTML(v.snippet.title), 
          creatorName: decodeHTML(v.snippet.channelTitle), 
          categoryId: category,
          pitch: "", 
          createdAt: Date.now(),
          publishedAt: new Date(v.snippet.publishedAt).getTime(),
          avgScore: 0
        });
      });

      await Promise.all(promises); 
      alert(`✅ Succès ! ${longVideos.length} vidéos ajoutées.`);
      onClose(); 
    } catch (e) { alert(`❌ ERREUR : ${e.message}`); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="flex border-b border-slate-800">
          <button onClick={() => setTab('channel')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest ${tab === 'channel' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500'}`}>+ Ajouter Chaîne</button>
          <button onClick={() => setTab('theme')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest ${tab === 'theme' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500'}`}>+ Créer Thème</button>
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
                    <button key={i.id} onClick={() => setSelectedIcon(i.id)} className={`p-4 rounded-xl border-2 transition-all ${selectedIcon === i.id ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-slate-800 text-slate-500'}`}>{i.icon}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleCreateTheme} disabled={loading} className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-white hover:bg-indigo-500 disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin mx-auto" size={20}/> : 'Créer ma thématique'}
              </button>
              
              {!userData?.isPremium && (
                <p className="text-center text-xs text-slate-500 mt-2">Vous avez utilisé {customThemes.length}/2 thématiques gratuites.</p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Thématique</label>
                <select className="w-full bg-slate-800 p-4 rounded-xl text-sm border-none outline-none text-white focus:ring-2 focus:ring-indigo-500" value={category} onChange={e => setCategory(e.target.value)}>
                  {/* Catégories Globales */}
                  <optgroup label="Catégories TubeMag">
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </optgroup>
                  
                  {/* Catégories Utilisateur */}
                  {customThemes.length > 0 && (
                    <optgroup label="Mes Thématiques">
                      {customThemes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nouvelle Chaîne YouTube</label>
                <input className="w-full bg-slate-800 p-4 rounded-xl text-sm outline-none text-white focus:ring-2 focus:ring-indigo-500" placeholder="ex: @MonsieurPhi" value={channelInput} onChange={e => setChannelInput(e.target.value)} />
              </div>
              <button onClick={fetchAndAutoIntegrate} disabled={loading} className="w-full bg-emerald-600 py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 hover:bg-emerald-500 disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin" size={18}/> : <><CheckCircle2 size={18} /> Ajouter la chaîne</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
