import React, { useEffect, useState } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, Send, Sparkles, UserCircle } from 'lucide-react';
import useBackButtonClose from '../hooks/useBackButtonClose';

/**
 * Fenêtre « Proposer une chaîne ».
 *
 * Elle vivait au fond de la modale de compte, sous le changement de mot
 * de passe. Personne ne descendait jusque-là. Elle a maintenant sa
 * propre fenêtre et son propre bouton, sur l'accueil.
 *
 * Ouverte à tout compte connecté : proposer une chaîne est un travail
 * que le membre rend au projet, pas un service qu'il reçoit. Le Studio
 * n'achète pas le droit de proposer, il lève le plafond. Deux
 * propositions par mois en gratuit, comptées côté serveur
 * (api/channel-proposals.js).
 *
 * Un visiteur non connecté voit la fenêtre et les règles, puis se fait
 * proposer la création d'un compte : il faut savoir qui propose pour
 * tenir le quota et pour revenir vers la personne.
 */
/**
 * La carte qui ouvre la fenêtre, posée en bas de l'accueil.
 *
 * Placée là volontairement : on vient de parcourir la sélection, donc
 * c'est le moment où l'on pense à ce qui manque. Visible aussi pour les
 * visiteurs sans compte, la fenêtre les orientera vers l'inscription.
 *
 * `accent` suit la couleur de l'app : fuchsia pour Culture, indigo pour
 * la version perso.
 */
export function ProposeChannelCard({ onOpen, accent = 'fuchsia' }) {
  const couleurs = accent === 'indigo'
    ? {
        cadre: 'border-indigo-500/30 bg-indigo-500/[0.07]',
        pastille: 'bg-indigo-500/15 text-indigo-300',
        bouton: 'bg-indigo-600 hover:bg-indigo-500',
      }
    : {
        cadre: 'border-fuchsia-500/30 bg-fuchsia-500/[0.07]',
        pastille: 'bg-fuchsia-500/15 text-fuchsia-300',
        bouton: 'bg-fuchsia-600 hover:bg-fuchsia-500',
      };

  return (
    <section className={`mx-4 md:mx-0 my-10 flex flex-col sm:flex-row sm:items-center gap-5 border ${couleurs.cadre} rounded-2xl p-6`}>
      <div className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${couleurs.pastille}`}>
        <Sparkles size={22} />
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-bold text-white mb-1">Il manque une chaîne ?</h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          La sélection se construit à la main, et une chaîne absente est le
          plus souvent une chaîne que je n'ai pas encore vue. Dites-nous
          laquelle.
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className={`shrink-0 px-5 py-3 ${couleurs.bouton} text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2`}
      >
        <Send size={15} /> Proposer une chaîne
      </button>
    </section>
  );
}

export default function ProposeChannelModal({
  user = null,
  mode = 'tubiscope',
  categories = [],
  onClose,
  onNeedAuth,
}) {
  useBackButtonClose(true, onClose, 'propose');

  const [handle, setHandle] = useState('');
  const [cat, setCat] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [quota, setQuota] = useState(null);

  // Quota lu à l'ouverture, pour afficher ce qu'il reste avant même que
  // l'utilisateur ait rempli quoi que ce soit. Un échec ne bloque rien :
  // le serveur retranche de toute façon au moment de l'envoi.
  useEffect(() => {
    if (!user) return undefined;
    let annule = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/propose-channel/quota', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!annule && data.success) setQuota(data);
      } catch {
        /* silencieux */
      }
    })();
    return () => { annule = true; };
  }, [user]);

  const epuise = quota && !quota.isPremium && quota.remaining <= 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);

    const raw = handle.trim();
    if (!raw) {
      setMsg({ type: 'error', text: 'Indiquez au moins le handle ou l\'URL de la chaîne.' });
      return;
    }
    if (!cat) {
      setMsg({ type: 'error', text: 'Choisissez une thématique.' });
      return;
    }

    setBusy(true);
    try {
      // L'écriture passe par le serveur : c'est lui qui tient le quota
      // mensuel et qui normalise le handle. Le navigateur n'écrit plus
      // dans /channelProposals.
      const token = await user.getIdToken();
      const res = await fetch('/api/propose-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          handle: raw,
          suggestedCategoryId: cat,
          reason: reason.trim().slice(0, 500),
          mode,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        // Le 429 (quota épuisé) renvoie aussi l'état du compteur : on le
        // garde pour que la ligne affiche « 0 restante » tout de suite.
        if (typeof data.remaining === 'number' || data.isPremium) setQuota(data);
        setMsg({ type: 'error', text: data.error || 'Envoi impossible.' });
        return;
      }

      setQuota(data);
      setHandle('');
      setReason('');
      setMsg({
        type: 'success',
        text: 'Merci ! Votre proposition est envoyée. La rédaction de Tubiscope va l\'examiner.',
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text: 'Impossible d\'envoyer la proposition : ' + (err.message || 'erreur inconnue'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-800 sticky top-0 bg-slate-900 rounded-t-2xl">
          <h2 className="flex items-center gap-2 text-xl font-bold text-white">
            <Sparkles size={18} className="text-fuchsia-400" />
            Proposer une chaîne
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            Vous repérez une chaîne YouTube qui a sa place ici ? Envoyez-la nous.
            Vous proposez, la rédaction choisit.
          </p>

          <div className="text-xs text-slate-400 bg-slate-800/40 border border-slate-800 rounded-xl p-4 leading-relaxed">
            <div className="font-semibold text-slate-300 mb-1">Ce qu'on retient</div>
            Une chaîne francophone, des vidéos de plus de trois minutes, une
            publication dans les trois derniers mois, un auteur identifiable.
            <div className="font-semibold text-slate-300 mt-3 mb-1">Ce qu'on écarte</div>
            Les chaînes de campagne, les voix off générées par une IA, la vitrine
            commerciale, et tout ce que la loi interdit de publier, à commencer
            par les œuvres piratées.
            <a
              href="/a-propos"
              target="_blank"
              rel="noopener"
              className="block mt-3 text-fuchsia-300 font-semibold hover:underline"
            >
              Les critères en détail →
            </a>
          </div>

          {!user ? (
            <>
              <p className="text-sm text-slate-400 leading-relaxed">
                Il faut un compte pour proposer une chaîne : c'est ce qui nous
                permet de revenir vers vous si la chaîne est retenue. La
                création prend trente secondes et ne demande qu'une adresse
                email.
              </p>
              <button
                type="button"
                onClick={onNeedAuth}
                className="w-full py-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <UserCircle size={16} /> Créer un compte ou se connecter
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Handle ou URL YouTube (ex : @MonsieurPhi)"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="w-full bg-slate-800 p-3 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-fuchsia-500"
              />

              <select
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="w-full bg-slate-800 p-3 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-fuchsia-500"
              >
                <option value="">Thématique suggérée…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <textarea
                placeholder="Pourquoi cette chaîne mérite sa place (facultatif, 500 caractères max)"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                rows={3}
                className="w-full bg-slate-800 p-3 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-fuchsia-500 resize-none"
              />

              {quota && !quota.isPremium && (
                <p className="text-xs text-slate-500">
                  {quota.remaining > 0 ? (
                    <>
                      Il vous reste{' '}
                      <strong className="text-slate-300">{quota.remaining}</strong>{' '}
                      proposition{quota.remaining > 1 ? 's' : ''} ce mois-ci.
                    </>
                  ) : (
                    <>Vous avez utilisé vos {quota.limit} propositions du mois. Le compteur repart le 1er.</>
                  )}{' '}
                  Illimité en Studio.
                </p>
              )}

              {msg && (
                <div
                  className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
                    msg.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/30 text-red-300'
                  }`}
                >
                  {msg.type === 'success' ? (
                    <CheckCircle size={16} className="shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  )}
                  <span>{msg.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || epuise}
                className="w-full py-3 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <Send size={14} /> Envoyer la proposition
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
