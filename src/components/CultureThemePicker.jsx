import React, { useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  CULTURE_CHANNELS,
  CULTURE_MAX_USER_THEMES,
} from '../data/cultureChannels';
import { CultureIcon } from '../data/cultureIcons';
import { useCategories } from '../hooks/useCategories';
import useBackButtonClose from '../hooks/useBackButtonClose';

// Sélecteur des 7 thématiques Culture parmi les 19 disponibles.
// S'affiche au premier accès ou via "Configurer mes thématiques" depuis le menu.
//
// Props :
//   user                 : Firebase user (uid utilisé pour la sauvegarde)
//   initialSelected      : ids déjà sélectionnés (array<string>)
//   onClose()            : fermer sans sauver
//   onSaved(themeIds)    : callback après save réussi
export default function CultureThemePicker({ user, initialSelected = [], onClose, onSaved }) {
  // Bouton Précédent du navigateur = ferme le picker (si onClose existe).
  // Au premier accès on a onClose=undefined, le picker reste donc bloquant.
  useBackButtonClose(!!onClose, onClose, 'picker');

  // Catégories Culture depuis Firestore (avec fallback)
  const CULTURE_THEMES = useCategories('culture');

  const [selected, setSelected] = useState(new Set(initialSelected));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id) => {
    setError('');
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= CULTURE_MAX_USER_THEMES) {
        setError(`Maximum ${CULTURE_MAX_USER_THEMES} thématiques.`);
        return;
      }
      next.add(id);
    }
    setSelected(next);
  };

  const save = async () => {
    if (selected.size === 0) {
      setError('Veuillez choisir au moins une thématique.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const ids = Array.from(selected);
      await setDoc(
        doc(db, 'users', user.uid),
        {
          culturePrefs: {
            themes: ids,
            setAt: Date.now(),
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );
      onSaved && onSaved(ids);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remaining = CULTURE_MAX_USER_THEMES - selected.size;

  return (
    <div className="fixed inset-0 z-[150] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-8 pt-8 pb-4 shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-fuchsia-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Sparkles size={20} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Vos 7 thématiques Culture</h2>
          </div>
          <p className="text-sm text-slate-400">
            Sélectionnez jusqu'à {CULTURE_MAX_USER_THEMES} thématiques parmi 19. Vous pourrez les modifier plus tard.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="bg-indigo-500/20 text-indigo-300 font-bold px-2.5 py-1 rounded-full">
              {selected.size} / {CULTURE_MAX_USER_THEMES}
            </span>
            {remaining > 0 && (
              <span className="text-slate-500">
                encore {remaining} disponible{remaining > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="px-8 pb-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CULTURE_THEMES.map((t) => {
              const isOn = selected.has(t.id);
              const channelCount = (CULTURE_CHANNELS[t.id] || []).length;
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                    isOn
                      ? 'border-fuchsia-500 bg-fuchsia-500/10'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-800/50'
                  }`}
                >
                  {isOn && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-fuchsia-500 rounded-full flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                  <div className={`mb-2 ${isOn ? 'text-fuchsia-300' : 'text-slate-400'}`}>
                    <CultureIcon themeId={t.id} size={22} />
                  </div>
                  <div className={`text-sm font-bold ${isOn ? 'text-white' : 'text-slate-200'}`}>
                    {t.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {channelCount} chaîne{channelCount > 1 ? 's' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mx-8 mb-3 p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl">
            {error}
          </div>
        )}

        <div className="px-8 py-5 border-t border-slate-800 flex items-center gap-3 shrink-0">
          {onClose && (
            <button
              onClick={onClose}
              disabled={saving}
              className="px-5 py-3 text-slate-400 hover:text-white text-sm font-bold disabled:opacity-50"
            >
              Annuler
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || selected.size === 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Check size={16} />
                Valider la sélection
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
