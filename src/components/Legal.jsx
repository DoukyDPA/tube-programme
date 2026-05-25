import React, { useState } from 'react';
import { X, Scale, ShieldCheck, FileText } from 'lucide-react';

// =====================================================================
// Documents légaux Tubiscope
// =====================================================================
// Statut : projet personnel non lucratif. Tubiscope est gratuit.
// Quand un plan payant (Studio) sera mis en place, des CGV seront
// ajoutées et la structure juridique adaptée (micro-entreprise).
//
// PLACEHOLDERS à remplacer avant publication :
//   [NOM_PRENOM]         : prénom + nom de l'éditeur
//   [ADRESSE_COMPLETE]   : numéro, rue, code postal, ville, pays
// =====================================================================

const EMAIL_CONTACT = 'daniel.p.angelini@gmail.com';
const URL_SITE = 'tubiscope.up.railway.app';

export default function Legal({ onClose, initialTab = 'mentions' }) {
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

        {/* Tabs */}
        <div className="flex border-b border-slate-800 shrink-0">
          <button
            onClick={() => setTab('mentions')}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${tab === 'mentions' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Scale size={14} /> Mentions légales
          </button>
          <button
            onClick={() => setTab('privacy')}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${tab === 'privacy' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <ShieldCheck size={14} /> Confidentialité
          </button>
          <button
            onClick={() => setTab('terms')}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${tab === 'terms' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <FileText size={14} /> CGU
          </button>
          <button onClick={onClose} className="p-4 text-slate-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Contenu */}
        <div className="p-8 md:p-10 overflow-y-auto text-slate-300 text-sm leading-relaxed space-y-6">
          {tab === 'mentions' && <MentionsLegales />}
          {tab === 'privacy' && <Privacy />}
          {tab === 'terms' && <Terms />}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 1. MENTIONS LÉGALES
// ============================================================
function MentionsLegales() {
  return (
    <>
      <h2 className="text-2xl font-bold text-white mb-2">Mentions légales</h2>
      <p className="text-xs text-slate-500 mb-6">
        Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
      </p>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Éditeur du site</h3>
        <p>
          Tubiscope est un projet personnel non lucratif édité à titre privé par&nbsp;:
        </p>
        <p className="mt-2">
          Daniel Pigeon-Angelini<br />
          France<br />
          Contact&nbsp;: <a href={`mailto:${EMAIL_CONTACT}`} className="text-indigo-400 hover:underline">{EMAIL_CONTACT}</a>
        </p>
        <p className="mt-3 text-xs text-slate-400">
          L'éditeur n'agit pas en qualité de professionnel. Tubiscope est mis à disposition à titre gratuit, sans contrepartie financière.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Directeur de la publication</h3>
        <p>Daniel Pigeon-Angelini, en sa qualité d'éditeur.</p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Hébergement</h3>
        <p>
          Le site est hébergé par&nbsp;:
        </p>
        <p className="mt-2">
          Railway Corporation<br />
          2261 Market Street #4382<br />
          San Francisco, CA 94114, États-Unis<br />
          <a href="https://railway.app" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">railway.app</a>
        </p>
        <p className="mt-3">
          Les données utilisateurs sont stockées via Google Firebase (Firestore et Authentication), opéré par&nbsp;:
        </p>
        <p className="mt-2">
          Google Ireland Limited<br />
          Gordon House, Barrow Street<br />
          Dublin 4, Irlande<br />
          <a href="https://firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">firebase.google.com</a>
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Propriété intellectuelle</h3>
        <p>
          La marque «&nbsp;Tubiscope&nbsp;», son logo, son interface et son code source sont la propriété de l'éditeur. Toute reproduction sans autorisation préalable est interdite.
        </p>
        <p className="mt-2">
          Les vidéos affichées dans Tubiscope sont hébergées par YouTube (Google LLC) et restent la propriété de leurs auteurs respectifs. Tubiscope se contente de référencer et d'organiser ces vidéos via l'API publique YouTube Data API v3, sans en stocker le contenu.
        </p>
        <p className="mt-2">
          L'utilisation du service implique l'acceptation des <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Conditions d'utilisation YouTube</a> et de la <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Politique de confidentialité Google</a>.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Signalement de contenu</h3>
        <p>
          Pour signaler un contenu illicite ou demander le retrait d'une référence, écrivez à&nbsp;
          <a href={`mailto:${EMAIL_CONTACT}`} className="text-indigo-400 hover:underline">{EMAIL_CONTACT}</a>. Une réponse vous sera apportée dans un délai raisonnable.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Loi applicable</h3>
        <p>
          Les présentes mentions sont régies par le droit français. En cas de litige, les tribunaux français sont seuls compétents.
        </p>
      </section>
    </>
  );
}

// ============================================================
// 2. POLITIQUE DE CONFIDENTIALITÉ (RGPD)
// ============================================================
function Privacy() {
  return (
    <>
      <h2 className="text-2xl font-bold text-white mb-2">Politique de confidentialité</h2>
      <p className="text-xs text-slate-500 mb-6">
        Conforme au Règlement Général sur la Protection des Données (RGPD). Dernière mise à jour&nbsp;: {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.
      </p>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Responsable du traitement</h3>
        <p>
          Le responsable du traitement des données est Daniel Pigeon-Angelini, éditeur de Tubiscope, joignable à&nbsp;
          <a href={`mailto:${EMAIL_CONTACT}`} className="text-indigo-400 hover:underline">{EMAIL_CONTACT}</a>.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Tubiscope étant un projet personnel non lucratif, aucun délégué à la protection des données (DPO) n'a été désigné. L'éditeur traite les demandes RGPD directement.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Données collectées</h3>
        <p>Tubiscope collecte les données suivantes&nbsp;:</p>
        <ul className="mt-3 space-y-2 list-disc list-inside text-slate-400">
          <li><strong className="text-slate-200">Adresse email</strong>&nbsp;: pour créer votre compte et vous permettre de vous connecter (via Firebase Authentication).</li>
          <li><strong className="text-slate-200">Identifiant unique (UID)</strong>&nbsp;: généré par Firebase pour vous identifier sans utiliser votre email partout.</li>
          <li><strong className="text-slate-200">Thématiques personnelles</strong>&nbsp;: les noms de vos thèmes custom et les chaînes YouTube que vous y associez.</li>
          <li><strong className="text-slate-200">Liste «&nbsp;À regarder plus tard&nbsp;»</strong>&nbsp;: les identifiants des vidéos YouTube que vous avez sauvegardées.</li>
          <li><strong className="text-slate-200">Date de création du compte</strong>&nbsp;: timestamp interne.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          Tubiscope ne collecte aucune donnée de navigation comportementale, ne pose aucun cookie publicitaire, ne pratique aucun profilage marketing.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Finalités du traitement</h3>
        <p>Ces données sont utilisées uniquement pour&nbsp;:</p>
        <ul className="mt-2 space-y-1 list-disc list-inside text-slate-400">
          <li>Vous permettre de vous connecter et d'accéder à votre espace personnel.</li>
          <li>Stocker vos préférences (thématiques, vidéos sauvegardées).</li>
          <li>Vous répondre si vous nous contactez.</li>
        </ul>
        <p className="mt-2">
          Base légale&nbsp;: votre consentement (création de compte) et l'exécution du service que vous utilisez (article 6.1.a et 6.1.b RGPD).
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Durée de conservation</h3>
        <p>
          Vos données sont conservées tant que votre compte est actif. Si vous supprimez votre compte, l'ensemble de vos données (thématiques, vidéos sauvegardées, profil) est supprimé dans un délai maximum de 30 jours, ce délai servant à parer une éventuelle erreur de manipulation de votre part.
        </p>
        <p className="mt-2">
          Au-delà, aucune donnée personnelle n'est conservée, sauf obligation légale (par exemple, conservation des emails de contact pour répondre à une demande RGPD pendant 1 an).
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Destinataires des données</h3>
        <p>
          Vos données sont stockées chez Google (Firebase). Aucune donnée n'est revendue, partagée avec des tiers commerciaux, ou utilisée à des fins publicitaires.
        </p>
        <p className="mt-2">
          Sous-traitants techniques&nbsp;:
        </p>
        <ul className="mt-2 space-y-1 list-disc list-inside text-slate-400">
          <li><strong className="text-slate-200">Google Firebase (Google Ireland Limited)</strong>&nbsp;: authentification et stockage. Données hébergées dans l'Union européenne (région Belgique par défaut).</li>
          <li><strong className="text-slate-200">Railway Corporation (États-Unis)</strong>&nbsp;: hébergement du serveur applicatif. Aucune donnée personnelle n'est stockée sur Railway, seul le code de l'application y tourne.</li>
          <li><strong className="text-slate-200">Google YouTube Data API</strong>&nbsp;: récupération des informations publiques sur les vidéos référencées. Aucune donnée personnelle vous concernant n'est transmise à YouTube via ce canal.</li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Transferts hors Union européenne</h3>
        <p>
          Firebase est opéré par Google Ireland Limited mais peut transférer des données vers les États-Unis dans le cadre de la maintenance et du support technique. Ces transferts sont encadrés par le Data Privacy Framework UE-USA, dont Google est signataire.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Vos droits</h3>
        <p>Conformément au RGPD, vous disposez des droits suivants&nbsp;:</p>
        <ul className="mt-2 space-y-1 list-disc list-inside text-slate-400">
          <li><strong className="text-slate-200">Droit d'accès</strong>&nbsp;: obtenir une copie de vos données.</li>
          <li><strong className="text-slate-200">Droit de rectification</strong>&nbsp;: corriger une donnée inexacte.</li>
          <li><strong className="text-slate-200">Droit à l'effacement</strong>&nbsp;: supprimer votre compte et vos données.</li>
          <li><strong className="text-slate-200">Droit à la portabilité</strong>&nbsp;: récupérer vos données dans un format lisible.</li>
          <li><strong className="text-slate-200">Droit d'opposition et de limitation</strong>&nbsp;: vous opposer au traitement ou en limiter la portée.</li>
        </ul>
        <p className="mt-3">
          Pour exercer ces droits, écrivez à <a href={`mailto:${EMAIL_CONTACT}`} className="text-indigo-400 hover:underline">{EMAIL_CONTACT}</a>. Une réponse vous sera apportée dans un délai d'un mois maximum.
        </p>
        <p className="mt-2">
          Vous pouvez également introduire une réclamation auprès de la Commission Nationale de l'Informatique et des Libertés (CNIL)&nbsp;: <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">cnil.fr</a>.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Cookies</h3>
        <p>
          Tubiscope n'utilise aucun cookie publicitaire ni de mesure d'audience. Les seuls cookies posés sont des cookies techniques strictement nécessaires au fonctionnement du service (session Firebase Authentication). Ces cookies sont exemptés de consentement (article 82 de la loi Informatique et Libertés).
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">Sécurité</h3>
        <p>
          L'accès à vos données est sécurisé par les règles Firebase Security Rules&nbsp;: seul vous (et l'administrateur du site pour des raisons techniques) pouvez lire et modifier vos thématiques et vos vidéos sauvegardées. Les communications avec le serveur sont chiffrées en HTTPS.
        </p>
      </section>
    </>
  );
}

// ============================================================
// 3. CONDITIONS GÉNÉRALES D'UTILISATION
// ============================================================
function Terms() {
  return (
    <>
      <h2 className="text-2xl font-bold text-white mb-2">Conditions Générales d'Utilisation</h2>
      <p className="text-xs text-slate-500 mb-6">
        Dernière mise à jour&nbsp;: {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
      </p>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">1. Objet</h3>
        <p>
          Tubiscope est un service en ligne qui permet d'organiser et de retrouver facilement des vidéos YouTube selon des thématiques. Le présent document fixe les règles d'usage du service, accessible à l'adresse <span className="text-indigo-400">{URL_SITE}</span>.
        </p>
        <p className="mt-2">
          En créant un compte ou en utilisant le service, vous acceptez sans réserve les présentes CGU.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">2. Accès au service</h3>
        <p>
          L'accès à Tubiscope est gratuit. Il nécessite une connexion internet et un compte créé via Firebase Authentication (email + mot de passe ou Google).
        </p>
        <p className="mt-2">
          L'éditeur s'efforce de maintenir le service disponible 24h/24, mais ne garantit aucune disponibilité continue. Des interruptions peuvent survenir pour maintenance, mise à jour, ou en raison de pannes des services tiers utilisés (Firebase, Railway, YouTube).
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">3. Compte utilisateur</h3>
        <p>
          Vous êtes responsable de la confidentialité de vos identifiants de connexion. Tout usage de votre compte est présumé fait par vous.
        </p>
        <p className="mt-2">
          Vous pouvez supprimer votre compte à tout moment depuis l'interface. La suppression entraîne la perte définitive de vos thématiques, des chaînes ajoutées et de votre liste «&nbsp;À regarder plus tard&nbsp;». Voir la <span className="text-indigo-400">Politique de confidentialité</span> pour le détail du traitement post-suppression.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">4. Contenu et usage du service</h3>
        <p>
          Tubiscope référence des vidéos publiquement accessibles sur YouTube via l'API officielle. L'éditeur ne valide pas, ne modère pas et ne sélectionne pas les vidéos individuellement. Vous êtes libre d'ajouter les chaînes de votre choix dans vos thématiques personnelles.
        </p>
        <p className="mt-2">
          Vous vous engagez à ne pas utiliser le service pour&nbsp;:
        </p>
        <ul className="mt-2 space-y-1 list-disc list-inside text-slate-400">
          <li>Référencer ou diffuser des contenus illicites, haineux, discriminatoires, ou contraires aux bonnes mœurs.</li>
          <li>Porter atteinte aux droits d'autrui (droit d'auteur, vie privée, dignité).</li>
          <li>Tenter de contourner les mesures techniques de sécurité du service.</li>
          <li>Effectuer un scraping massif ou automatisé du service.</li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">5. Propriété intellectuelle</h3>
        <p>
          Les vidéos référencées dans Tubiscope appartiennent à leurs auteurs respectifs et sont diffusées depuis les serveurs YouTube. Tubiscope ne stocke aucun contenu vidéo.
        </p>
        <p className="mt-2">
          La structure du service, son code, son design et la marque «&nbsp;Tubiscope&nbsp;» sont la propriété de l'éditeur et ne peuvent être reproduits sans son accord.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">6. Responsabilité</h3>
        <p>
          Tubiscope est fourni «&nbsp;en l'état&nbsp;», sans garantie d'aucune sorte. L'éditeur ne peut être tenu responsable&nbsp;:
        </p>
        <ul className="mt-2 space-y-1 list-disc list-inside text-slate-400">
          <li>D'une indisponibilité temporaire ou définitive du service.</li>
          <li>De la perte de vos données en cas de panne, sauvegardes étant réalisées par Firebase mais sans engagement de l'éditeur.</li>
          <li>Du contenu des vidéos référencées, hébergées et modérées par YouTube.</li>
          <li>Des conséquences directes ou indirectes de l'usage du service.</li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">7. Suspension d'un compte</h3>
        <p>
          L'éditeur se réserve le droit de suspendre ou supprimer un compte qui ne respecterait pas les présentes CGU, sans préavis ni indemnité, en cas notamment de référencement de contenus illicites ou de tentative d'atteinte à la sécurité du service.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">8. Modification des CGU</h3>
        <p>
          L'éditeur peut modifier les présentes CGU à tout moment. Les modifications prennent effet dès leur publication sur cette page. Vous serez informé d'une modification substantielle par email ou par une notification dans l'interface.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">9. Droit applicable et litiges</h3>
        <p>
          Les présentes CGU sont régies par le droit français. En cas de litige, et avant toute action contentieuse, vous êtes invité à contacter l'éditeur à <a href={`mailto:${EMAIL_CONTACT}`} className="text-indigo-400 hover:underline">{EMAIL_CONTACT}</a> pour rechercher une solution amiable. À défaut d'accord, les tribunaux français sont seuls compétents.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-2">10. Contact</h3>
        <p>
          Pour toute question relative aux présentes CGU&nbsp;:&nbsp;
          <a href={`mailto:${EMAIL_CONTACT}`} className="text-indigo-400 hover:underline">{EMAIL_CONTACT}</a>
        </p>
      </section>
    </>
  );
}
