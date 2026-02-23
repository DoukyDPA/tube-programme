import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

// Comme nous sommes côté serveur (Node.js), nous n'avons pas de DOMParser. 
// On utilise une fonction de remplacement classique pour nettoyer les titres.
const decodeHTML = (str) => {
  if (!str) return "";
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
};

const parseDuration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || 0, 10);
  const m = parseInt(match[2] || 0, 10);
  const s = parseInt(match[3] || 0, 10);
  return h * 3600 + m * 60 + s;
};

export default async function handler(req, res) {
  // Configuration Firebase via les variables d'environnement Vercel
  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
  };

  const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY;
  const FIREBASE_APP_ID = "tube-prog-v0";

  // 1. LA LISTE DES CHAÎNES À SURVEILLER AUTOMATIQUEMENT
  // Ajoutez autant de chaînes que vous le souhaitez ici :
  const CHANNELS_TO_MONITOR = [
    { handle: "@MonsieurPhi", category: "ia" },
    { handle: "@NotaBene", category: "lecture" },
    { handle: "@Wiloo", category: "foot" }
  ];

  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    await signInAnonymously(auth);

    // 2. Récupérer toutes les vidéos existantes pour ne pas faire de doublons
    const programsRef = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
    const existingDocs = await getDocs(programsRef);
    const existingIds = new Set();
    existingDocs.forEach(d => existingIds.add(d.data().youtubeId));

    let addedCount = 0;

    // 3. Scanner chaque chaîne
    for (const channel of CHANNELS_TO_MONITOR) {
      // Trouver l'ID de la chaîne
      const cRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=${channel.handle}&part=id`);
      const cData = await cRes.json();
      if (!cData.items || cData.items.length === 0) continue;
      const cid = cData.items[0].id;

      // Récupérer les 5 dernières vidéos de la chaîne
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${cid}&part=snippet,id&order=date&maxResults=5&type=video`);
      const vData = await vRes.json();
      if (!vData.items) continue;

      const videoIds = vData.items.map(v => v.id.videoId).join(',');
      const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails`);
      const detailsData = await detailsRes.json();

      // Traiter les vidéos
      for (const v of vData.items) {
        if (existingIds.has(v.id.videoId)) continue; // Ignorer si déjà dans la base !

        const detail = detailsData.items?.find(d => d.id === v.id.videoId);
        if (!detail) continue;
        if (parseDuration(detail.contentDetails.duration) < 120) continue; // Ignorer les shorts

        // Nouvelle vidéo longue détectée ! Ajout à la base.
        const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
        await setDoc(newDocRef, {
          id: newDocRef.id,
          youtubeId: v.id.videoId,
          title: decodeHTML(v.snippet.title),
          creatorName: decodeHTML(v.snippet.channelTitle),
          categoryId: channel.category,
          pitch: "",
          createdAt: Date.now(),
          publishedAt: new Date(v.snippet.publishedAt).getTime(),
          avgScore: 0
        });
        
        addedCount++;
        existingIds.add(v.id.videoId); // Sécurité anti-doublon en direct
      }
    }

    return res.status(200).json({ success: true, message: `Synchronisation terminée. ${addedCount} nouvelles vidéos ajoutées à Tubemag.` });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}