import React, { useState } from 'react';
import { auth } from '../firebase';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { X, Lock, Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * Modal de gestion du compte personnel.
 * Deux actions :
 *  1. Changer le mot de passe (re-auth requise par Firebase)
 *  2. Envoyer un email de réinitialisation
 */
export default function AccountModal({ user, onClose }) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'success' | 'error', text: string }

  const showMsg = (type, text) => {
    setMsg({ type, text });
    if (type === 'success') {
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMsg(null);

    if (newPwd.length < 6) {
      showMsg('error', 'Le nouveau mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (newPwd !== confirmPwd) {
      showMsg('error', 'Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }

    setBusy(true);
    try {
      // Firebase impose une re-auth récente pour changer le mot de passe
      const credential = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPwd);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      showMsg('success', 'Mot de passe mis à jour.');
    } catch (err) {
      const code = err.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        showMsg('error', 'Mot de passe actuel incorrect.');
      } else if (code === 'auth/weak-password') {
        showMsg('error', 'Mot de passe trop faible (6 caractères minimum).');
      } else if (code === 'auth/too-many-requests') {
        showMsg('error', 'Trop d\'essais. Réessayez dans quelques minutes.');
      } else {
        showMsg('error', 'Erreur : ' + (err.message || 'inconnue'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResetByEmail = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      showMsg('success', 'Email de réinitialisation envoyé à ' + user.email + '. Vérifiez votre boîte (et les spams).');
    } catch (err) {
      showMsg('error', 'Impossible d\'envoyer l\'email : ' + (err.message || 'erreur inconnue'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white">Mon compte</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Email affiché */}
          <div className="text-sm">
            <div className="text-slate-500 mb-1">Email du compte</div>
            <div className="text-slate-200 font-mono text-sm">{user.email}</div>
          </div>

          {/* Message flash */}
          {msg && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
              msg.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}>
              {msg.type === 'success' ? <CheckCircle size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
              <span>{msg.text}</span>
            </div>
          )}

          {/* Formulaire changement mdp */}
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-2">
              <Lock size={14} /> Changer mon mot de passe
            </div>
            <input
              type="password"
              placeholder="Mot de passe actuel"
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              className="w-full bg-slate-800 p-3 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              required
              autoComplete="current-password"
            />
            <input
              type="password"
              placeholder="Nouveau mot de passe (6 caractères min.)"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              className="w-full bg-slate-800 p-3 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              required
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Confirmer le nouveau mot de passe"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              className="w-full bg-slate-800 p-3 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              required
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all"
            >
              {busy ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Mettre à jour'}
            </button>
          </form>

          {/* Séparateur */}
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <div className="flex-1 h-px bg-slate-800" />
            ou
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Reset par email */}
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-2">
              <Mail size={14} /> Mot de passe oublié ?
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Recevez un lien par email pour le réinitialiser sans avoir à fournir l'ancien.
            </p>
            <button
              type="button"
              onClick={handleResetByEmail}
              disabled={busy}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl font-semibold text-sm transition-all"
            >
              Envoyer le lien de réinitialisation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
