import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  Loader2,
  LogOut,
  Sparkles,
  Home,
  UserCircle,
  ExternalLink,
  Settings,
  Info,
  RefreshCw,
  Compass,
  Plus,
} from 'lucide-react';

import { auth, db, YOUTUBE_API_KEY_CULTURE } from '../firebase';
import {
  CULTURE_CHANNELS,
  CULTURE_VIDEOS_PER_THEME,
} from '../data/cultureChannels';
import { CultureIcon } from '../data/cultureIcons';
import { MODE_CULTURE } from '../data/appMode';
import { useCategories } from '../hooks/useCategories';
import { capProgramsPerChannel } from '../utils/programs';

import Auth from './Auth';
import ProgramRow from './ProgramRow';
import ProgramGrid from './ProgramGrid';
import VideoModal from './VideoModal';
import CultureThemePicker from './CultureThemePicker';
import DiscoverBanner from './DiscoverBanner';
import AccountModal from './AccountModal';
import Guide from './Guide';
import Legal from './Legal';

// Logo Tubiscope avec sous-titre "Culture"
const CultureLogo = () => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-gradient-to-br from-fuchsia-500 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-fuchsia-500/20 shrink-0">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6"
      >
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" fill="white" />
      </svg>
    </div>
    <div className="flex flex-col leading-tight">
      <h1 className="text-xl font-black text-white tracking-tight">
        Tubi<span className="text-fuchsia-400">Scope</span>
      </h1>
      <span className="text-[10px] font-bold text-fuchsia-300/80 uppercase tracking-widest">
        Culture
      </span>
    </div>
  </div>
);

// Récupère un channelId YouTube pour un handle en lisant culture-channels-resolved.json
// embarqué côté client. Si le mapping n'est pas dispo on tombe sur null (la
// chaîne sera ignorée).
const useResolvedChannels = () => {
  const [map, setMap] = useState(null);
  useEffect(() => {
    fetch('/culture-channels-resolved.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMap(j || {}))
      .catch(() => setMap({}));
  }, []);
  return map;
};

// Parse une durée ISO8601 YouTube (PT4M13S, etc.) en secondes.
const parseDuration = (duration) => {
  if (!duration) return 0;
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (
    parseInt(m[1] || 0, 10) * 3600 +
    parseInt(m[2] || 0, 10) * 60 +
    parseInt(m[3] || 0, 10)
  );
};

const MIN_DURATION_S = 180;

export default function CultureApp() {
  // Catégories Culture (19 thématiques) chargées depuis Firestore avec fallback.
  // Remplace l'ancien import CULTURE_THEMES de cultureChannels.js.
  const CULTURE_THEMES = useCategories('culture');

  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncSubMessage, setSyncSubMessage] = useState('');

  // Vidéos par thématique. Indexé par themeId, valeur = array de programmes.
  const [themePrograms, setThemePrograms] = useState({});

  const [hydrated, setHydrated] = useState({});
  const [hydratedWatchLater, setHydratedWatchLater] = useState([]);

  const [selectedProg, setSelectedProg] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [activeTab, setActiveTab] = useState('accueil');
  const [legalTab, setLegalTab] = useState(null);

  // Thématiques que l'utilisateur consulte sans les avoir sélectionnées.
  // Alimenté quand on clique sur une rubrique « à découvrir ». Le listener
  // Firestore s'abonne aux programmes correspondants, sans modifier le
  // doc user. L'utilisateur peut ensuite ajouter la rubrique à ses
  // thématiques via le bouton dédié en haut de la page de détail.
  const [previewThemeIds, setPreviewThemeIds] = useState([]);
  const [addingTheme, setAddingTheme] = useState(false);

  const resolved = useResolvedChannels();

  // -- Auth + chargement userData --
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const tokenResult = await u.getIdTokenResult();
          setIsAdmin(tokenResult.claims?.admin === true);
        } catch (e) {
          console.error('Erreur lecture token:', e);
          setIsAdmin(false);
        }
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setUserData(snap.data());
        } else {
          const init = { isPremium: false, themeCount: 0, watchLater: [], watchLaterCulture: [] };
          await setDoc(ref, init);
          setUserData(init);
        }
      } else {
        setIsAdmin(false);
        setUserData(null);
        setThemePrograms({});
      }
      setLoading(false);
    });
  }, []);

  // Listener live sur le doc user pour synchroniser culturePrefs
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [user]);

  const userThemeIds = userData?.culturePrefs?.themes || [];
  const hasConfigured = userThemeIds.length > 0;

  // Thématiques effectivement écoutées : celles choisies + celles en preview.
  // Mémoïsé pour éviter de rebrancher le listener à chaque rendu.
  const listenedThemeIds = useMemo(() => {
    const set = new Set(userThemeIds);
    previewThemeIds.forEach((id) => set.add(id));
    return Array.from(set);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(userThemeIds), JSON.stringify(previewThemeIds)]);

  // -- Listener sur les programmes de chaque thématique écoutée --
  useEffect(() => {
    if (!user || listenedThemeIds.length === 0) {
      setThemePrograms({});
      return;
    }
    const unsubs = listenedThemeIds.map((themeId) => {
      const q = collection(db, 'scopes', themeId, 'programs');
      return onSnapshot(q, (snap) => {
        const raw = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _source: 'scope',
          _scopeId: themeId,
        }));
        // Déduplication défensive par youtubeId : un sync partiel
        // (quota Firestore coupé en cours) peut laisser plusieurs docs
        // pour la même vidéo. On garde le plus récent par createdAt.
        const byYid = new Map();
        for (const p of raw) {
          const existing = byYid.get(p.youtubeId);
          if (!existing || (p.createdAt || 0) > (existing.createdAt || 0)) {
            byYid.set(p.youtubeId, p);
          }
        }
        const docs = Array.from(byYid.values());
        setThemePrograms((prev) => ({ ...prev, [themeId]: docs }));
      });
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, JSON.stringify(listenedThemeIds)]);

  // Liste plate des programmes pour hydratation
  const allPrograms = useMemo(
    () => Object.values(themePrograms).flat(),
    [themePrograms]
  );

  // Dernières vidéos toutes thématiques confondues (affichage "À la Une")
  const latestPrograms = useMemo(() => {
    const seen = new Set();
    const flat = [];
    for (const list of Object.values(hydrated)) {
      for (const p of list) {
        if (seen.has(p.youtubeId)) continue;
        seen.add(p.youtubeId);
        flat.push(p);
      }
    }
    return flat
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
      .slice(0, 5);
  }, [hydrated]);

  // Hydratation YouTube : titres, créateur, dates
  // Optimisation : on ne fetche YouTube QUE pour les vidéos qui n'ont pas
  // encore title/creatorName en base. Les syncs récentes stockent ces
  // champs directement, donc le quota baisse au fil du renouvellement.
  useEffect(() => {
    const run = async () => {
      const watchLaterIds = userData?.watchLaterCulture || [];
      if (allPrograms.length === 0 && watchLaterIds.length === 0) {
        setHydrated({});
        setHydratedWatchLater([]);
        return;
      }

      // Index pour retrouver les vidéos par youtubeId
      const progByYid = new Map();
      for (const p of allPrograms) progByYid.set(p.youtubeId, p);

      // Ne reste à hydrater que ce qui n'a pas de title en base
      const needHydration = new Set();
      for (const p of allPrograms) {
        if (!p.title) needHydration.add(p.youtubeId);
      }
      for (const id of watchLaterIds) {
        const existing = progByYid.get(id);
        if (!existing || !existing.title) needHydration.add(id);
      }

      const fetched = {};
      if (YOUTUBE_API_KEY_CULTURE && needHydration.size > 0) {
        const ids = Array.from(needHydration);
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50).join(',');
          try {
            const res = await fetch(
              `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY_CULTURE}&id=${chunk}&part=snippet`
            );
            const data = await res.json();
            if (data.items) {
              data.items.forEach((it) => {
                fetched[it.id] = {
                  title: it.snippet.title,
                  creatorName: it.snippet.channelTitle,
                  channelId: it.snippet.channelId,
                  publishedAt: new Date(it.snippet.publishedAt).getTime(),
                };
              });
            }
          } catch (e) {
            console.error('Hydratation YT échouée:', e);
          }
        }
      }

      // Programmes par thématique, triés par date desc et tronqués
      const byTheme = {};
      Object.entries(themePrograms).forEach(([themeId, progs]) => {
        const merged = progs.map((p) => ({
          ...p,
          title: p.title || fetched[p.youtubeId]?.title || 'Vidéo indisponible',
          creatorName:
            p.creatorName || fetched[p.youtubeId]?.creatorName || 'Créateur inconnu',
          channelHandleId: fetched[p.youtubeId]?.channelId || p.channelId,
          publishedAt:
            p.publishedAt || fetched[p.youtubeId]?.publishedAt || p.createdAt,
        }));
        byTheme[themeId] = merged
          .sort((a, b) => b.publishedAt - a.publishedAt)
          .slice(0, CULTURE_VIDEOS_PER_THEME);
      });
      setHydrated(byTheme);

      // Watch later
      const wlMerged = watchLaterIds.map((id) => {
        const existing =
          progByYid.get(id) || {
            id: `wl-${id}`,
            youtubeId: id,
            createdAt: Date.now(),
          };
        return {
          ...existing,
          title: existing.title || fetched[id]?.title || 'Vidéo supprimée ou privée',
          creatorName:
            existing.creatorName || fetched[id]?.creatorName || 'Inconnu',
          publishedAt:
            existing.publishedAt || fetched[id]?.publishedAt || existing.createdAt,
        };
      });
      setHydratedWatchLater(wlMerged);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(allPrograms.map((p) => p.id)),
    JSON.stringify(userData?.watchLaterCulture || []),
  ]);

  // Toggle watch later (partagé avec la version standard)
  const toggleWatchLater = async (prog) => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const currentWl = userData?.watchLaterCulture || [];
    const isWl = currentWl.includes(prog.youtubeId);
    try {
      if (isWl) {
        await setDoc(
          ref,
          { watchLaterCulture: arrayRemove(prog.youtubeId) },
          { merge: true }
        );
      } else {
        if (currentWl.length >= 10) {
          alert("Limite atteinte : 10 vidéos maximum dans 'À regarder plus tard'.");
          return;
        }
        await setDoc(
          ref,
          { watchLaterCulture: arrayUnion(prog.youtubeId) },
          { merge: true }
        );
      }
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    }
  };

  // -----------------------------------------------------------------
  // Actualisation Culture depuis le navigateur (admin only).
  // Source de vérité : collection Firestore /channels (mode == 'culture'),
  // alignée avec /api/sync-culture et la page admin-channels.html. On
  // n'utilise plus le fichier statique cultureChannels.js : les chaînes
  // supprimées via l'admin ne réapparaissent donc plus à l'actualisation.
  // -----------------------------------------------------------------
  const syncCultureFromBrowser = async () => {
    if (!YOUTUBE_API_KEY_CULTURE) {
      return alert('Clé API YouTube Culture manquante.');
    }
    if (!isAdmin) {
      return alert("Réservé à l'admin.");
    }
    if (!user) return;

    setIsSyncing(true);
    setSyncMessage('Chargement des chaînes Culture...');
    setSyncSubMessage('');

    let totalAdded = 0;
    let totalDeleted = 0;

    try {
      // Purge le vieux cache localStorage de l'ancienne logique
      // (handle -> channelId), qui pouvait ressusciter des chaînes
      // supprimées depuis la console admin.
      try {
        localStorage.removeItem('cultureResolved');
      } catch {
        // ignore
      }

      // 1. Lit toutes les chaînes Culture depuis Firestore
      const chSnap = await getDocs(
        query(collection(db, 'channels'), where('mode', '==', 'culture'))
      );
      const allChannels = chSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => c.channelId && c.categoryId);

      // Groupe par catégorie / thématique
      const byTheme = {};
      for (const ch of allChannels) {
        (byTheme[ch.categoryId] ||= []).push(ch);
      }

      const themesWithChannels = CULTURE_THEMES.filter(
        (t) => (byTheme[t.id] || []).length > 0
      );

      let themeIdx = 0;
      for (const theme of themesWithChannels) {
        themeIdx++;
        const channels = byTheme[theme.id] || [];
        if (channels.length === 0) continue;

        setSyncMessage(
          `Récupération des vidéos (${themeIdx} sur ${themesWithChannels.length})`
        );
        setSyncSubMessage(`Thématique : ${theme.label}`);

        const candidates = [];
        let chIdx = 0;
        for (const ch of channels) {
          chIdx++;
          if (chIdx % 5 === 0 || chIdx === channels.length) {
            setSyncSubMessage(
              `${theme.label} : chaîne ${chIdx} sur ${channels.length}`
            );
          }
          try {
            const playlistId = ch.channelId.replace(/^UC/, 'UU');
            const pRes = await fetch(
              `https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY_CULTURE}&playlistId=${playlistId}&part=contentDetails,snippet&maxResults=10`
            );
            const pData = await pRes.json();
            if (!pData.items) continue;

            const videoIds = pData.items
              .map((v) => v.contentDetails.videoId)
              .join(',');
            const dRes = await fetch(
              `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY_CULTURE}&id=${videoIds}&part=contentDetails,snippet`
            );
            const dData = await dRes.json();

            for (const it of pData.items) {
              const det = dData.items?.find(
                (d) => d.id === it.contentDetails.videoId
              );
              if (!det) continue;
              if (parseDuration(det.contentDetails.duration) < MIN_DURATION_S)
                continue;
              candidates.push({
                youtubeId: it.contentDetails.videoId,
                channelId: ch.channelId,
                publishedAt: new Date(
                  det.snippet?.publishedAt || it.snippet.publishedAt
                ).getTime(),
                title: det.snippet?.title || it.snippet?.title || '',
                creatorName: det.snippet?.channelTitle || '',
              });
            }
          } catch (e) {
            console.warn(`Fetch ${ch.handle} échoué:`, e.message);
          }
        }

        // Tri par date puis dédup par youtubeId (deux chaînes peuvent référencer
        // la même vidéo, on garde la plus récente occurrence).
        candidates.sort((a, b) => b.publishedAt - a.publishedAt);
        const seenYid = new Set();
        const dedupedCandidates = [];
        for (const c of candidates) {
          if (seenYid.has(c.youtubeId)) continue;
          seenYid.add(c.youtubeId);
          dedupedCandidates.push(c);
        }
        const top = dedupedCandidates.slice(0, CULTURE_VIDEOS_PER_THEME);
        const topIds = new Set(top.map((v) => v.youtubeId));

        // Côté Firestore : si des doublons existent déjà (ancien sync sans
        // dédup), on garde un seul doc par youtubeId et on supprime les autres.
        const existing = themePrograms[theme.id] || [];
        const existingByYid = new Map();
        const oldDuplicates = [];
        for (const p of existing) {
          if (!existingByYid.has(p.youtubeId)) {
            existingByYid.set(p.youtubeId, p);
          } else {
            oldDuplicates.push(p);
          }
        }
        const existingIds = new Set(existingByYid.keys());

        const toAdd = top.filter((v) => !existingIds.has(v.youtubeId));
        const toDelete = [
          ...oldDuplicates,
          ...Array.from(existingByYid.values()).filter(
            (p) => !topIds.has(p.youtubeId)
          ),
        ];

        // Écritures batchées (Firestore : max 500 ops par batch)
        const colRef = collection(db, 'scopes', theme.id, 'programs');
        for (let i = 0; i < toAdd.length; i += 400) {
          const batch = writeBatch(db);
          for (const v of toAdd.slice(i, i + 400)) {
            const ref = doc(colRef);
            batch.set(ref, {
              youtubeId: v.youtubeId,
              channelId: v.channelId,
              categoryId: theme.id,
              addedBy: user.uid,
              pitch: '',
              createdAt: Date.now(),
              avgScore: 0,
              // Métadonnées YouTube stockées pour éviter l'hydratation client
              title: v.title || '',
              creatorName: v.creatorName || '',
              publishedAt: v.publishedAt,
            });
            totalAdded++;
          }
          await batch.commit();
        }
        for (let i = 0; i < toDelete.length; i += 400) {
          const batch = writeBatch(db);
          for (const p of toDelete.slice(i, i + 400)) {
            batch.delete(doc(db, 'scopes', theme.id, 'programs', p.id));
            totalDeleted++;
          }
          await batch.commit();
        }
      }

      alert(
        `Sync Culture terminée : ${totalAdded} vidéos ajoutées, ${totalDeleted} supprimées (sur ${allChannels.length} chaînes en base).`
      );
    } catch (e) {
      alert(`Erreur sync : ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // -----------------------------------------------------------------
  // Suppression d'une vidéo d'un scope Culture (admin only).
  // Le programme vit dans scopes/{themeId}/programs/{progId}. On le
  // retire de Firestore, le listener onSnapshot rafraîchit l'UI.
  // -----------------------------------------------------------------
  const removeProgram = async (prog) => {
    if (!isAdmin) {
      return alert("Réservé à l'admin.");
    }
    if (!prog?.id || !prog?._scopeId) {
      // Cas particulier : vidéo issue de "À regarder plus tard" pas en scope
      return;
    }
    if (
      !window.confirm(
        `Supprimer définitivement « ${prog.title || prog.youtubeId} » de la thématique ?`
      )
    ) {
      return;
    }
    try {
      await deleteDoc(
        doc(db, 'scopes', prog._scopeId, 'programs', prog.id)
      );
    } catch (e) {
      alert(`Erreur suppression : ${e.message}`);
    }
  };

  // -----------------------------------------------------------------
  // Migration des métadonnées : pour chaque document Firestore Culture
  // qui n'a pas title/creatorName/publishedAt, on les récupère via
  // YouTube et on les écrit en base. À lancer une seule fois après
  // déploiement de la nouvelle structure de données. Coût : ~ N/50
  // unités de quota (1 unité par lot de 50 vidéos).
  // -----------------------------------------------------------------
  const migrateCultureMetadata = async () => {
    if (!YOUTUBE_API_KEY_CULTURE) {
      return alert('Clé API YouTube Culture manquante.');
    }
    if (!isAdmin) return alert("Réservé à l'admin.");
    if (
      !window.confirm(
        'Migrer les métadonnées (title, créateur, date) pour les anciennes vidéos Culture ?\nUne seule fois suffit.'
      )
    ) {
      return;
    }

    setIsSyncing(true);
    setSyncMessage('Migration des métadonnées Culture');
    setSyncSubMessage('Lecture des thématiques...');

    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalMissing = 0;

    try {
      for (const theme of CULTURE_THEMES) {
        const docs = themePrograms[theme.id] || [];
        const needFill = docs.filter((p) => !p.title);
        if (needFill.length === 0) continue;

        setSyncMessage(`Migration : ${theme.label}`);
        setSyncSubMessage(`${needFill.length} vidéos à hydrater`);

        const ids = needFill.map((p) => p.youtubeId);
        const meta = {};

        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50).join(',');
          const r = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY_CULTURE}&id=${chunk}&part=snippet`
          );
          const d = await r.json();
          if (d.items) {
            for (const it of d.items) {
              meta[it.id] = {
                title: it.snippet?.title || '',
                creatorName: it.snippet?.channelTitle || '',
                publishedAt: it.snippet?.publishedAt
                  ? new Date(it.snippet.publishedAt).getTime()
                  : null,
              };
            }
          }
        }

        // Écritures Firestore en batch
        for (let i = 0; i < needFill.length; i += 400) {
          const batch = writeBatch(db);
          for (const p of needFill.slice(i, i + 400)) {
            const m = meta[p.youtubeId];
            if (!m) {
              totalMissing++;
              continue;
            }
            const ref = doc(db, 'scopes', theme.id, 'programs', p.id);
            batch.set(
              ref,
              {
                title: m.title,
                creatorName: m.creatorName,
                publishedAt: m.publishedAt || p.createdAt,
              },
              { merge: true }
            );
            totalUpdated++;
          }
          await batch.commit();
        }

        totalSkipped += docs.length - needFill.length;
      }

      alert(
        `Migration Culture terminée.\n` +
          `Mises à jour : ${totalUpdated}\n` +
          `Déjà à jour : ${totalSkipped}\n` +
          `Vidéos introuvables (privées/supprimées) : ${totalMissing}`
      );
    } catch (e) {
      alert(`Erreur migration : ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // -----------------------------------------------------------------
  // Audit des chaînes Culture : pour chaque handle résolu, récupère la
  // date de la dernière vidéo publiée. Télécharge un CSV récap pour
  // identifier les chaînes mortes ou dormantes.
  // -----------------------------------------------------------------
  const auditCultureChannels = async () => {
    if (!YOUTUBE_API_KEY_CULTURE) {
      return alert('Clé API YouTube Culture manquante.');
    }
    if (!isAdmin) return alert("Réservé à l'admin.");

    setIsSyncing(true);
    setSyncMessage('Audit des chaînes Culture');
    setSyncSubMessage('');

    let resolvedMap = { ...(resolved || {}) };
    try {
      const ls = JSON.parse(localStorage.getItem('cultureResolved') || '{}');
      resolvedMap = { ...ls, ...resolvedMap };
    } catch {
      // ignore
    }

    const themeLabel = (id) =>
      CULTURE_THEMES.find((t) => t.id === id)?.label || id;

    // 1) Construit la liste complète des handles déclarés
    const declared = [];
    for (const theme of CULTURE_THEMES) {
      const list = CULTURE_CHANNELS[theme.id] || [];
      for (const ch of list) {
        declared.push({ handle: ch.handle, name: ch.name, themeId: theme.id });
      }
    }

    // 2) Sépare les résolus (à auditer en interrogeant YouTube) des non résolus
    const resolvedEntries = declared.filter(
      (d) => resolvedMap[d.handle]?.channelId
    );
    const unresolvedEntries = declared.filter(
      (d) => !resolvedMap[d.handle]?.channelId
    );

    if (declared.length === 0) {
      setIsSyncing(false);
      return alert('Aucune chaîne déclarée à auditer.');
    }

    const results = [];

    // Les non résolues vont directement dans le CSV avec statut "unresolved"
    for (const d of unresolvedEntries) {
      results.push({
        handle: d.handle,
        name: d.name || '',
        themeId: d.themeId || '',
        themeLabel: themeLabel(d.themeId),
        channelId: '',
        lastVideoTitle: '',
        lastVideoDate: '',
        daysSinceLast: '',
        status: 'unresolved',
      });
    }

    let i = 0;
    const entries = resolvedEntries.map((d) => [d.handle, { ...resolvedMap[d.handle], name: d.name, themeId: d.themeId }]);
    for (const [handle, info] of entries) {
      i++;
      if (i % 10 === 0 || i === entries.length) {
        setSyncSubMessage(`Chaîne ${i} sur ${entries.length}`);
      }
      try {
        const playlistId = info.channelId.replace(/^UC/, 'UU');
        const r = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY_CULTURE}&playlistId=${playlistId}&part=contentDetails,snippet&maxResults=1`
        );
        const d = await r.json();
        const item = d.items?.[0];
        if (!item) {
          results.push({
            handle,
            name: info.name || '',
            themeId: info.themeId || '',
            themeLabel: themeLabel(info.themeId),
            channelId: info.channelId,
            lastVideoTitle: '',
            lastVideoDate: '',
            daysSinceLast: '',
            status: 'no_videos',
          });
          continue;
        }
        const publishedAt = new Date(item.snippet.publishedAt);
        const days = Math.floor(
          (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        let status = 'active';
        if (days > 365 * 3) status = 'dead';
        else if (days > 365) status = 'silent';
        else if (days > 180) status = 'slow';
        results.push({
          handle,
          name: info.name || '',
          themeId: info.themeId || '',
          themeLabel: themeLabel(info.themeId),
          channelId: info.channelId,
          lastVideoTitle: item.snippet.title || '',
          lastVideoDate: publishedAt.toISOString().slice(0, 10),
          daysSinceLast: days,
          status,
        });
      } catch (e) {
        console.warn(`Audit @${handle} échoué:`, e.message);
        results.push({
          handle,
          name: info.name || '',
          themeId: info.themeId || '',
          themeLabel: themeLabel(info.themeId),
          channelId: info.channelId,
          lastVideoTitle: '',
          lastVideoDate: '',
          daysSinceLast: '',
          status: 'error',
        });
      }
    }

    // Tri : les plus dormantes en haut
    results.sort((a, b) => {
      const da = a.daysSinceLast === '' ? Infinity : a.daysSinceLast;
      const db = b.daysSinceLast === '' ? Infinity : b.daysSinceLast;
      return db - da;
    });

    // CSV
    const csvHeader = [
      'handle',
      'name',
      'themeId',
      'themeLabel',
      'channelId',
      'lastVideoTitle',
      'lastVideoDate',
      'daysSinceLast',
      'status',
    ];
    const csvEscape = (s) => {
      const str = String(s ?? '');
      if (/[",;\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const csv = [
      csvHeader.join(';'),
      ...results.map((r) =>
        csvHeader.map((k) => csvEscape(r[k])).join(';')
      ),
    ].join('\n');

    // Téléchargement
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `audit-culture-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const dead = results.filter((r) => r.status === 'dead').length;
    const silent = results.filter((r) => r.status === 'silent').length;
    const noVid = results.filter((r) => r.status === 'no_videos').length;
    const unresolved = results.filter((r) => r.status === 'unresolved').length;
    setIsSyncing(false);
    alert(
      `Audit terminé. ${results.length} chaînes analysées.\n` +
        `Handle introuvable sur YouTube : ${unresolved}\n` +
        `Mortes (>3 ans) : ${dead}\n` +
        `Silencieuses (>1 an) : ${silent}\n` +
        `Aucune vidéo : ${noVid}\n\n` +
        `CSV téléchargé : audit-culture-${stamp}.csv`
    );
  };

  // Construit l'URL d'une chaîne YouTube depuis le handle stocké côté front
  const handleToYouTubeUrl = (themeId) => {
    return null; // placeholder, on construit l'URL au moment du clic via le handle
  };

  // -----------------------------------------------------------------
  // Ouverture d'une rubrique non choisie : on l'ajoute aux thématiques
  // en preview (listener Firestore se branche) et on navigue dessus.
  // Pas d'écriture dans le doc user à ce stade.
  // -----------------------------------------------------------------
  const openThemePreview = (themeId) => {
    setPreviewThemeIds((prev) =>
      prev.includes(themeId) ? prev : [...prev, themeId]
    );
    setActiveTab(themeId);
  };

  // -----------------------------------------------------------------
  // Ajout d'une thématique en preview à la sélection de l'utilisateur.
  // Une écriture Firestore unique sur users/{uid}. Respecte la limite
  // CULTURE_MAX_USER_THEMES (importée plus bas pour rester local).
  // -----------------------------------------------------------------
  const addPreviewToUserThemes = async (themeId) => {
    if (!user) return;
    const MAX = 7; // CULTURE_MAX_USER_THEMES
    if (userThemeIds.includes(themeId)) {
      setPreviewThemeIds((prev) => prev.filter((id) => id !== themeId));
      return;
    }
    if (userThemeIds.length >= MAX) {
      alert(
        `Vous avez déjà ${MAX} thématiques. Retirez-en une depuis « Modifier mes thématiques » pour en ajouter une nouvelle.`
      );
      return;
    }
    setAddingTheme(true);
    try {
      const next = [...userThemeIds, themeId];
      await setDoc(
        doc(db, 'users', user.uid),
        {
          culturePrefs: {
            themes: next,
            setAt: Date.now(),
          },
        },
        { merge: true }
      );
      // La thématique passe officiellement dans la sélection : on la
      // retire de la liste preview pour éviter le doublon dans le listener.
      setPreviewThemeIds((prev) => prev.filter((id) => id !== themeId));
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    } finally {
      setAddingTheme(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-fuchsia-500" size={40} />
      </div>
    );
  }

  if (!user) return <Auth />;

  // Première connexion : on force le picker
  if (!hasConfigured) {
    return (
      <CultureThemePicker
        user={user}
        initialSelected={[]}
        onSaved={() => {}}
      />
    );
  }

  // Thématiques sélectionnées par l'utilisateur, dans l'ordre canonique
  const orderedUserThemes = CULTURE_THEMES.filter((t) =>
    userThemeIds.includes(t.id)
  );

  // Thématiques non choisies, dans l'ordre canonique. Utilisées pour la
  // ligne « Découvrez nos autres rubriques ».
  const unselectedThemes = CULTURE_THEMES.filter(
    (t) => !userThemeIds.includes(t.id)
  );

  // True si l'utilisateur regarde une rubrique qu'il n'a pas choisie.
  const isPreviewingActive =
    activeTab !== 'accueil' &&
    activeTab !== 'guide' &&
    !userThemeIds.includes(activeTab);

  return (
    <div className="min-h-screen md:h-screen bg-[#0a0f1c] text-slate-200 flex flex-col md:flex-row font-sans overflow-hidden">
      {/* SIDEBAR PC */}
      <aside className="hidden md:flex w-[260px] bg-slate-950/95 border-r border-slate-800/50 flex-col z-50 overflow-y-auto shadow-2xl">
        <div className="p-8">
          <CultureLogo />
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <button
            onClick={() => setActiveTab('accueil')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'accueil'
                ? 'bg-fuchsia-600/10 text-fuchsia-300 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Home size={18} /> Accueil
          </button>

          <div className="mt-8 mb-3 px-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            Vos thématiques
          </div>
          {orderedUserThemes.map((t) => {
            const count = (CULTURE_CHANNELS[t.id] || []).length;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-fuchsia-600/10 text-fuchsia-300 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <span className={isActive ? 'text-fuchsia-300' : 'text-slate-500'}>
                  <CultureIcon themeId={t.id} size={18} />
                </span>
                <span className="text-sm flex-1 text-left truncate">{t.label}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500">
                  {count}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setShowPicker(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all mt-4"
          >
            <Settings size={18} /> Modifier mes thématiques
          </button>

          <div className="my-4 border-t border-slate-800/60" />

          <button
            onClick={() => setActiveTab('guide')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'guide'
                ? 'bg-fuchsia-600/10 text-fuchsia-300 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Info size={18} /> Guide & légal
          </button>
        </nav>

        <div className="p-6 mt-auto border-t border-slate-800/50 space-y-3">
          <button
            onClick={() => setShowAccount(true)}
            className="w-full flex items-center gap-2 text-slate-400 hover:text-fuchsia-300 transition-colors text-sm font-semibold"
          >
            <UserCircle size={16} /> Votre compte
          </button>
          <button
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-2 text-slate-500 hover:text-red-400 transition-colors text-sm font-semibold"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* NAVBAR MOBILE */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/98 backdrop-blur-lg border-t border-slate-800/50 flex justify-around items-center p-3 z-50 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button
          onClick={() => setActiveTab('accueil')}
          className={`flex flex-col items-center gap-1 p-2 transition-colors ${
            activeTab === 'accueil' ? 'text-fuchsia-300' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Home size={22} />
          <span className="text-[10px] font-bold">Accueil</span>
        </button>
        <button
          onClick={() => setShowPicker(true)}
          className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-fuchsia-300 transition-colors"
        >
          <Settings size={22} />
          <span className="text-[10px] font-bold">Thèmes</span>
        </button>
        <button
          onClick={() => setShowAccount(true)}
          className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-fuchsia-300 transition-colors"
        >
          <UserCircle size={22} />
          <span className="text-[10px] font-bold">Compte</span>
        </button>
        <button
          onClick={() => signOut(auth)}
          className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-red-400 transition-colors"
        >
          <LogOut size={22} />
          <span className="text-[10px] font-bold">Sortir</span>
        </button>
      </div>

      <main className="flex-1 overflow-y-auto h-screen pb-24 md:pb-0 relative">
        <DiscoverBanner mode={MODE_CULTURE} />

        <header className="flex justify-between items-center p-4 md:p-10 pb-4 md:pb-8">
          <div className="md:hidden">
            <CultureLogo />
          </div>
          <h2 className="hidden md:block text-2xl md:text-3xl font-bold text-white tracking-tight">
            {activeTab === 'accueil'
              ? 'À la Une'
              : activeTab === 'guide'
              ? 'Guide & légal'
              : CULTURE_THEMES.find((t) => t.id === activeTab)?.label}
          </h2>
          {isAdmin && activeTab !== 'guide' && (
            <div className="flex items-center gap-2">
              <a
                href="/admin-channels.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all"
                title="Ouvrir l'admin des chaînes Culture"
              >
                <Settings size={16} />
                <span className="hidden md:inline">Admin</span>
              </a>
              <button
                onClick={auditCultureChannels}
                disabled={isSyncing}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all disabled:opacity-50"
                title="Télécharge un CSV des chaînes avec leur dernière date de publication"
              >
                <Info size={16} />
                <span className="hidden md:inline">Auditer</span>
              </button>
              <button
                onClick={syncCultureFromBrowser}
                disabled={isSyncing}
                className="flex items-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-3 py-2 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold shadow-lg shadow-fuchsia-500/20 transition-all disabled:opacity-50"
              >
                {isSyncing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                <span className="hidden md:inline">
                  {isSyncing ? 'Synchronisation...' : 'Actualiser'}
                </span>
              </button>
            </div>
          )}
        </header>

        <div className="px-0 md:px-10">
          {activeTab === 'guide' ? (
            <Guide onOpenLegal={(t) => setLegalTab(t)} />
          ) : activeTab === 'accueil' ? (
            <>
              {latestPrograms.length > 0 && (
                <ProgramRow
                  title="Dernières vidéos"
                  programs={latestPrograms}
                  large={true}
                  onSelect={setSelectedProg}
                  onRemove={removeProgram}
                  currentUser={user}
                  isAdmin={isAdmin}
                  toggleWatchLater={toggleWatchLater}
                  watchLaterList={userData?.watchLaterCulture || []}
                />
              )}

              {hydratedWatchLater.length > 0 && (
                <ProgramRow
                  title="À regarder plus tard"
                  programs={hydratedWatchLater}
                  small={true}
                  onSelect={setSelectedProg}
                  onRemove={removeProgram}
                  currentUser={user}
                  isAdmin={isAdmin}
                  toggleWatchLater={toggleWatchLater}
                  watchLaterList={userData?.watchLaterCulture || []}
                />
              )}
              {orderedUserThemes.map((t) => {
                const progs = capProgramsPerChannel(hydrated[t.id] || []);
                if (progs.length === 0) return null;
                return (
                  <ThemeRow
                    key={t.id}
                    theme={t}
                    programs={progs}
                    onSelect={setSelectedProg}
                    onRemove={removeProgram}
                    isAdmin={isAdmin}
                    toggleWatchLater={toggleWatchLater}
                    watchLaterList={userData?.watchLaterCulture || []}
                    currentUser={user}
                    resolved={resolved}
                  />
                );
              })}
              {orderedUserThemes.every((t) => (hydrated[t.id] || []).length === 0) && (
                <EmptyState
                  onPick={() => setShowPicker(true)}
                  isAdmin={isAdmin}
                  onSync={syncCultureFromBrowser}
                  isSyncing={isSyncing}
                />
              )}
              {unselectedThemes.length > 0 && (
                <DiscoverRubriquesRow
                  themes={unselectedThemes}
                  onPick={openThemePreview}
                />
              )}
            </>
          ) : (
            <ThemeDetail
              theme={CULTURE_THEMES.find((t) => t.id === activeTab)}
              programs={capProgramsPerChannel(hydrated[activeTab] || [])}
              onSelect={setSelectedProg}
              onRemove={removeProgram}
              isAdmin={isAdmin}
              toggleWatchLater={toggleWatchLater}
              watchLaterList={userData?.watchLaterCulture || []}
              currentUser={user}
              resolved={resolved}
              isPreview={isPreviewingActive}
              onAddToMyThemes={() => addPreviewToUserThemes(activeTab)}
              addingTheme={addingTheme}
              canAddMore={userThemeIds.length < 7}
            />
          )}
        </div>
      </main>

      {selectedProg && (
        <VideoModal prog={selectedProg} onClose={() => setSelectedProg(null)} />
      )}
      {showPicker && (
        <CultureThemePicker
          user={user}
          initialSelected={userThemeIds}
          onClose={() => setShowPicker(false)}
          onSaved={() => setShowPicker(false)}
        />
      )}
      {showAccount && (
        <AccountModal
          user={user}
          onClose={() => setShowAccount(false)}
          isStudio={!!userData?.isPremium}
          categories={CULTURE_THEMES}
        />
      )}
      {legalTab && <Legal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
      {isSyncing && (
        <SyncOverlay message={syncMessage} subMessage={syncSubMessage} />
      )}
    </div>
  );
}

// --- Bloc "thématique" sur l'accueil : titre, vidéos, liste de chaînes en bas ---
function ThemeRow({ theme, programs, onSelect, onRemove, isAdmin, toggleWatchLater, watchLaterList, currentUser, resolved }) {
  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-3 px-4 md:px-0">
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="text-fuchsia-300">
            <CultureIcon themeId={theme.id} size={22} />
          </span>
          {theme.label}
        </h2>
      </div>
      <ProgramRow
        title={null}
        programs={programs}
        onSelect={onSelect}
        onRemove={onRemove}
        currentUser={currentUser}
        isAdmin={isAdmin}
        toggleWatchLater={toggleWatchLater}
        watchLaterList={watchLaterList}
      />
    </div>
  );
}

// --- Liste verticale des chaînes cliquables vers YouTube ---
// S'affiche dans la vue détail d'une thématique. Sur grand écran on
// présente deux ou trois colonnes pour gagner en lisibilité.
function ChannelList({ channels, resolved }) {
  return (
    <div className="px-4 md:px-0 mb-8">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">
        {channels.length} chaînes de la thématique
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {channels.map((ch) => {
          const r = resolved?.[ch.handle];
          const url = r?.channelId
            ? `https://www.youtube.com/channel/${r.channelId}`
            : `https://www.youtube.com/@${ch.handle}`;
          return (
            <a
              key={ch.handle}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-slate-900/50 hover:bg-fuchsia-500/10 border border-slate-800 hover:border-fuchsia-500/30 transition-colors"
              title={`Ouvrir ${ch.name} sur YouTube`}
            >
              <span className="text-sm font-semibold text-slate-200 group-hover:text-fuchsia-200 truncate">
                {ch.name}
              </span>
              <ExternalLink
                size={12}
                className="text-slate-500 group-hover:text-fuchsia-300 shrink-0"
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}

// --- Vue détail d'une thématique : vidéos en haut, chaînes en liste dessous ---
function ThemeDetail({
  theme,
  programs,
  onSelect,
  onRemove,
  isAdmin,
  toggleWatchLater,
  watchLaterList,
  currentUser,
  resolved,
  isPreview = false,
  onAddToMyThemes,
  addingTheme = false,
  canAddMore = true,
}) {
  if (!theme) return null;
  const channels = CULTURE_CHANNELS[theme.id] || [];
  return (
    <>
      {isPreview && (
        <div className="px-4 md:px-0 mb-4">
          <div className="bg-gradient-to-r from-fuchsia-500/10 to-indigo-500/10 border border-fuchsia-500/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
            <Sparkles size={18} className="text-fuchsia-300 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">
                Vous découvrez cette rubrique
              </p>
              <p className="text-xs text-slate-300">
                Elle n'est pas encore dans votre sélection. Ajoutez-la pour la
                retrouver à chaque visite.
              </p>
            </div>
            <button
              onClick={onAddToMyThemes}
              disabled={addingTheme || !canAddMore}
              className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 shrink-0 inline-flex items-center justify-center gap-2"
              title={
                canAddMore
                  ? 'Ajouter cette rubrique à mes thématiques'
                  : 'Limite de 7 thématiques atteinte'
              }
            >
              {addingTheme ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {canAddMore
                ? 'Ajouter à mes thématiques'
                : 'Limite de 7 atteinte'}
            </button>
          </div>
        </div>
      )}
      <div className="px-4 md:px-0 mb-6">
        <p className="text-sm text-slate-400">
          {channels.length} chaînes, jusqu'à {programs.length} vidéos récentes.
        </p>
      </div>
      <ProgramGrid
        programs={programs}
        onSelect={onSelect}
        onRemove={onRemove}
        currentUser={currentUser}
        isAdmin={isAdmin}
        toggleWatchLater={toggleWatchLater}
        watchLaterList={watchLaterList}
      />
      <ChannelList channels={channels} resolved={resolved} />
    </>
  );
}

// --- Ligne « Découvrez nos autres rubriques » : boutons cliquables
//     vers les thématiques non choisies. Style inspiré de Molotov. ---
function DiscoverRubriquesRow({ themes, onPick }) {
  if (!themes || themes.length === 0) return null;
  return (
    <div className="mb-12 mt-4">
      <div className="px-4 md:px-0 mb-3">
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="text-fuchsia-300">
            <Compass size={22} />
          </span>
          Découvrez nos autres rubriques
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Ces thématiques ne sont pas dans votre sélection. Cliquez pour
          parcourir leurs vidéos.
        </p>
      </div>
      <div className="px-4 md:px-0">
        <div className="flex flex-wrap gap-2">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900/60 hover:bg-fuchsia-500/15 border border-slate-800 hover:border-fuchsia-500/40 text-slate-200 hover:text-fuchsia-200 text-sm font-semibold transition-colors"
              title={`Découvrir « ${t.label} »`}
            >
              <span className="text-slate-500 group-hover:text-fuchsia-300">
                <CultureIcon themeId={t.id} size={16} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Empty state quand aucune vidéo n'est encore syncée ---
function EmptyState({ onPick, isAdmin, onSync, isSyncing }) {
  return (
    <div className="px-4 md:px-0">
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center">
        <Sparkles className="mx-auto text-fuchsia-400 mb-3" size={32} />
        <h3 className="text-lg font-bold text-white mb-2">
          {isAdmin ? 'Pas encore de vidéos' : 'Les vidéos arrivent'}
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          {isAdmin
            ? 'Lance la première synchronisation pour récupérer les vidéos de tes thématiques. Compte quelques minutes au premier passage.'
            : 'La première synchronisation YouTube peut prendre quelques minutes. Revenez dans un instant.'}
        </p>
        <div className="flex flex-col md:flex-row gap-2 justify-center">
          {isAdmin && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isSyncing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              {isSyncing ? 'Synchronisation...' : 'Lancer la synchronisation'}
            </button>
          )}
          <button
            onClick={onPick}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-bold"
          >
            Modifier vos thématiques
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Overlay plein écran pendant la synchronisation ---
function SyncOverlay({ message, subMessage }) {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <Loader2
          className="animate-spin text-fuchsia-400 mx-auto mb-4"
          size={40}
        />
        <h3 className="text-lg font-bold text-white mb-2">
          {message || 'Synchronisation en cours'}
        </h3>
        {subMessage && (
          <p className="text-sm text-slate-400 mb-3">{subMessage}</p>
        )}
        <p className="text-xs text-slate-500">
          Ne fermez pas cet onglet. La première synchronisation interroge plus
          de 350 chaînes YouTube et peut prendre quelques minutes.
        </p>
      </div>
    </div>
  );
}
