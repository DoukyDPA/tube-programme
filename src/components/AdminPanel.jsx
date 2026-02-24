import React, { useState } from 'react';
import { Cpu, BookOpen, Trophy, Mic2, X, CheckCircle2, Loader2, Sparkles, Edit2, Check, Trash2 } from 'lucide-react';
import { db, FIREBASE_APP_ID, YOUTUBE_API_KEY } from '../firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const ADMIN_EMAIL = "daniel.p.angelini@gmail.com";

const ICONS = [
  { id: 'ia', icon: <Cpu size={18}/> },
  { id: 'lecture', icon: <BookOpen size={18}/> },
  { id: 'foot', icon: <Trophy size={18}/> },
  { id: 'interviews', icon: <Mic2 size={18}/> },
  { id: 'custom', icon: <Sparkles size={18}/> }
];

const CATEGORIES = [
  { id: 'ia', label: 'IA & Tech Scope' },
  { id: 'lecture', label: 'Culture Scope' },
  { id: 'foot', label: 'Economie Scope' },
  { id: 'interviews', label: 'Talks Scope' },
];

const parseDuration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0, 10) * 3600) + (parseInt(match[2] || 0, 10) * 60) + parseInt(match[3] || 0, 10);
};

export default function AdminPanel({ user, userData, customThemes = [], onClose }) {
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [tab, setTab] = useState('channel');
  const [loading, setLoading] = useState(false);
  
  const [themeName, setThemeName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('ia');

  const [editingThemeId, setEditingThemeId] = useState(null);
  const [editThemeName, setEditThemeName] = useState('');

  const [channelInput, setChannelInput] = useState('');
  const [category, setCategory] = useState(isAdmin ? 'ia' : (customThemes[0]?.id || ''));

  const handleCreateTheme = async () => {
    if (!themeName.trim()) return;
    if (!userData?.isPremium && customThemes.length >= 2) return alert("💎 Limite atteinte. Passez Premium pour plus de thèmes.");

    setLoading(true);
    try {
      const themeRef = doc(collection(db, 'users', user.uid, 'themes'));
      await setDoc(themeRef, { name: themeName, icon: selectedIcon, createdAt: Date.now() });
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { themeCount: customThemes.length + 1 }, { merge: true });

      alert("Thématique créée !");
      setThemeName('');
      if (!isAdmin && customThemes.length === 0) setCategory(themeRef.id);
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleUpdateTheme = async (themeId) => {
    if (!editThemeName.trim()) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'themes', themeId), { name: editThemeName });
      setEditingThemeId(null);
    } catch (e) { alert(e.message); }
  };

  const handleDeleteTheme = async (themeId) => {
    if (confirm("Supprimer cette thématique ?")) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'themes', themeId));
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { themeCount: Math.max(0, customThemes.length - 1) }, { merge: true });
        
        if (!isAdmin && category === themeId) {
            const remainingThemes = customThemes.filter(t => t.id !== themeId);
            setCategory(remainingThemes.length > 0 ? remainingThemes[0].id : '');
        }
      } catch (e) { alert(e.message); }
    }
  };

  const fetchAndAutoIntegrate = async () => {
    if (!YOUTUBE_API_KEY) return alert("❌ Clé API YouTube manquante !");
    if (!channelInput.trim()) return alert("Entrez une chaîne.");
    if (!category) return alert("Sélectionnez une thématique.");
    
    setLoading(true);
    try {
      let cid = channelInput.trim();
      if (!cid.startsWith('@') && !cid.startsWith('UC')) cid = '@' + cid;
      
      if (cid.startsWith('@')) {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=${cid}&part=id`);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        if (data.items?.length > 0) cid = data.items[0].id;
        else throw new Error("Chaîne introuvable.");
      }
      
      const playlistId = cid.replace(/^UC/, 'UU');
      const pRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&maxResults=15`);
      const pData = await pRes.json();
      
      if (pData.error) throw new Error(pData.error.message);
      if (!pData.items || pData.items.length === 0) throw new Error("Aucune vidéo publique.");

      const videoIds = pData.items.map(v => v.contentDetails.videoId).join(',');
      const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails`);
      const detailsData = await detailsRes.json();

      const longVideos = pData.items.filter(v => {
        const detail = detailsData.items?.find(d => d.id === v.contentDetails.videoId);
        return detail && parseDuration(detail.contentDetails.duration) >= 180;
      }).slice(0, 5); 

      if (longVideos.length === 0) throw new Error("Aucune vidéo de plus de 3 min.");
      
      const promises = longVideos.map(v => {
        const vidId = v.contentDetails.videoId;
        const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
        
        // CONFORMITÉ ToS: Ne pas enregistrer de données statiques (title, nom de chaîne...)
        return setDoc(newDocRef, {
          id: newDocRef.id,
          youtubeId: vidId,
          channelId: cid, 
          categoryId: category,
          addedBy: user.uid,
          pitch: "", 
          createdAt: Date.now(),
          avgScore: 0
        });
      });

      await Promise.all(promises); 
      alert(`✅ ${longVideos.length} vidéos ajoutées.`);
      setChannelInput('');
    } catch (e) { alert(`❌ ERREUR : ${e.message}`); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex border-b border-slate-800 shrink-0">
          <button onClick={() => setTab('channel')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest ${tab === 'channel' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}>+ Ajouter Chaîne</button>
          <button onClick={() => setTab('theme')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest ${tab === 'theme' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}>Mes Thèmes</button>
          <button onClick={onClose} className="p-4 text-slate-500 hover:text-white"><X size={20}/></button>
        </div>

        <div className="p-8 overflow-y-auto">
          {tab === 'theme' ? (
            <div className="space-y-8">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Nouvelle thématique</label>
                  <input className="w-full bg-slate-800 p-4 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm" value={themeName} onChange={e => setThemeName(e.target.value)} placeholder="Ex: Science & Espace" />
                </div>
                <div>
                  <div className="flex gap-2">
                    {ICONS.map(i => (
                      <button key={i.id} onClick={() => setSelectedIcon(i.id)} className={`p-3 rounded-xl border-2 transition-all ${selectedIcon === i.id ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-slate-800 text-slate-500 hover:border-slate-600'}`}>{i.icon}</button>
                    ))}
                  </div>
                </div>
                <button onClick={handleCreateTheme} disabled={loading} className="w-full bg-indigo-600 py-3 rounded-xl font-bold text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
                  {loading ? <Loader2 className="animate-spin mx-auto" size={18}/> : 'Créer'}
                </button>
              </div>

              {customThemes.length > 0 && (
                <div className="border-t border-slate-800 pt-6">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Mes Thématiques Créées</h3>
                  <div className="space-y-3">
                    {customThemes.map(ct => (
                      <div key={ct.id} className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                        {editingThemeId === ct.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input value={editThemeName} onChange={e => setEditThemeName(e.target.value)} className="flex-1 bg-slate-900 px-3 py-1.5 rounded-lg text-sm text-white outline-none border focus:border-indigo-500" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleUpdateTheme(ct.id)} />
                            <button onClick={() => handleUpdateTheme(ct.id)} className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg"><Check size={16}/></button>
                            <button onClick={() => setEditingThemeId(null)} className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg"><X size={16}/></button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400">{ICONS.find(i => i.id === ct.icon)?.icon || <Sparkles size={16}/>}</span>
                              <span className="text-sm font-semibold text-slate-200">{ct.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingThemeId(ct.id); setEditThemeName(ct.name); }} className="p-2 text-slate-400 hover:text-indigo-400 rounded-lg"><Edit2 size={14}/></button>
                              <button onClick={() => handleDeleteTheme(ct.id)} className="p-2 text-slate-400 hover:text-red-400 rounded-lg"><Trash2 size={14}/></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {!isAdmin && customThemes.length === 0 ? (
                <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm text-center">Créez d'abord une thématique.</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Destination</label>
                    <select className="w-full bg-slate-800 p-4 rounded-xl text-sm border-none text-white focus:ring-2 focus:ring-indigo-500" value={category} onChange={e => setCategory(e.target.value)}>
                      {isAdmin && <optgroup label="Catégories TubiScope">{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>}
                      {customThemes.length > 0 && <optgroup label="Mes Thématiques">{customThemes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chaîne YouTube</label>
                    <input className="w-full bg-slate-800 p-4 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500" placeholder="@MonsieurPhi" value={channelInput} onChange={e => setChannelInput(e.target.value)} />
                  </div>
                  <button onClick={fetchAndAutoIntegrate} disabled={loading} className="w-full bg-emerald-600 py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 hover:bg-emerald-500 disabled:opacity-50">
                    {loading ? <Loader2 className="animate-spin" size={18}/> : <><CheckCircle2 size={18} /> Ajouter la chaîne</>}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
