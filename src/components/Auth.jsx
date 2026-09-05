import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { detectAppMode, otherModeUrl, MODE_CULTURE } from '../data/appMode';

const AUTH_ERRORS = {
  'auth/invalid-credential': "Email ou mot de passe incorrect.",
  'auth/wrong-password': "Mot de passe incorrect.",
  'auth/user-not-found': "Aucun compte avec cet email.",
  'auth/invalid-email': "Format d'email invalide.",
  'auth/missing-password': "Le mot de passe est vide.",
  'auth/weak-password': "Mot de passe trop court (6 caractères minimum).",
  'auth/email-already-in-use': "Un compte existe déjà avec cet email.",
  'auth/too-many-requests': "Trop d'essais. Réessaie dans quelques minutes.",
  'auth/network-request-failed': "Pas de connexion réseau.",
  'auth/user-disabled': "Ce compte a été désactivé.",
  'auth/operation-not-allowed': "Méthode de connexion désactivée côté Firebase.",
};

// Props :
//   onClose() : si fourni, le formulaire est ouvert par-dessus une page
//               déjà consultable (mode visiteur). On affiche alors une
//               sortie, et on ouvre sur la création de compte, puisque
//               c'est ce que le visiteur venait chercher.
export default function Auth({ onClose }) {
  const [isLogin, setIsLogin] = useState(!onClose);

  // Sur tubiscope.com, ce formulaire est la première chose que voit un
  // visiteur. Lui proposer d'aller voir Tubiscope Culture, qui se
  // consulte sans compte, vaut mieux que de le laisser devant un mur.
  const mode = detectAppMode();
  const showCultureExit = !onClose && mode !== MODE_CULTURE;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || "Une erreur s'est produite. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-[200] p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-[2rem] shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          {isLogin ? 'Bon retour sur TubiScope' : 'Créer un compte'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" placeholder="Email" className="w-full bg-slate-800 p-4 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Mot de passe" className="w-full bg-slate-800 p-4 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500" value={password} onChange={e => setPassword(e.target.value)} required />

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 rounded-xl">
              {error}
            </div>
          )}

          <button disabled={loading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all">
            {loading ? '...' : (isLogin ? 'Se connecter' : "S'inscrire")}
          </button>
          
          <p className="text-xs text-slate-500 text-center mt-4">
            En vous connectant, vous acceptez nos <a href="#" className="underline hover:text-indigo-400">Conditions Générales</a> et notre <a href="#" className="underline hover:text-indigo-400">Politique de confidentialité</a>.
          </p>
        </form>
        <button onClick={switchMode} className="w-full mt-6 text-slate-400 text-sm hover:text-white">
          {isLogin ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="w-full mt-3 text-slate-500 text-sm hover:text-white"
          >
            Continuer sans compte
          </button>
        )}

        {showCultureExit && (
          <div className="mt-8 pt-6 border-t border-slate-800">
            <p className="text-sm text-slate-400 mb-3 leading-relaxed">
              Pas envie de créer un compte tout de suite ? Tubiscope Culture se
              visite librement : 120 chaînes culturelles choisies, rangées en
              11 thématiques.
            </p>
            <a
              href={otherModeUrl(mode)}
              className="w-full inline-flex items-center justify-center gap-2 bg-fuchsia-600/15 hover:bg-fuchsia-600/25 border border-fuchsia-500/30 text-fuchsia-200 py-3 rounded-xl text-sm font-bold transition-colors"
            >
              Voir Tubiscope Culture
              <ExternalLink size={14} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
