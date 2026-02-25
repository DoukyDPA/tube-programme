import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'; 

const parseDuration = (duration) => {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0, 10) * 3600) + (parseInt(match[2] || 0, 10) * 60) + parseInt(match[3] || 0, 10);
};

export default async function handler(req, res) {
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

  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    await signInAnonymously(auth);

    const programsRef = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
    const existingDocs = await getDocs(programsRef);
    
    const existingIds = new Set();
    const channelsToMonitor = new Map();
    const videosByChannel = {}; // Dictionnaire pour regrouper les vidéos par chaîne

    existingDocs.forEach(d => {
      const data = d.data();
      existingIds.add(data.youtubeId);
      
      if (data.channelId) {
        // Grouper les vidéos existantes par chaîne
        if (!videosByChannel[data.channelId]) videosByChannel[data.channelId] = [];
        videosByChannel[data.channelId].push({ docId: d.id, createdAt: data.createdAt });

        // Identifier les chaînes à surveiller
        if (data.categoryId) {
          channelsToMonitor.set(data.channelId, { 
            id: data.channelId, 
            category: data.categoryId,
            addedBy: data.addedBy || "system" 
          });
        }
      }
    });

    let addedCount = 0;
    let deletedCount = 0;

    // 1. Scanner chaque chaîne pour ajouter les nouveautés
    for (const [channelId, channelInfo] of channelsToMonitor) {
      const playlistId = channelId.replace(/^UC/, 'UU');
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY}&playlistId=${playlistId}&part=contentDetails&maxResults=5`);
      const vData = await vRes.json();
      
      if (!vData.items) continue;

      const videoIds = vData.items.map(v => v.contentDetails.videoId).join(',');
      const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails`);
      const detailsData = await detailsRes.json();

      for (const v of vData.items) {
        const vidId = v.contentDetails.videoId;
        if (existingIds.has(vidId)) continue; 

        const detail = detailsData.items?.find(d => d.id === vidId);
        if (!detail) continue;
        if (parseDuration(detail.contentDetails.duration) < 180) continue; 

        const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
        const now = Date.now();

        await setDoc(newDocRef, {
          id: newDocRef.id,
          youtubeId: vidId,
          channelId: channelId,
          categoryId: channelInfo.category,
          addedBy: channelInfo.addedBy,
          pitch: "",
          createdAt: now,
          avgScore: 0
        });
        
        addedCount++;
        existingIds.add(vidId);

        // Ajouter la nouvelle vidéo à notre liste de suivi pour le nettoyage
        if (!videosByChannel[channelId]) videosByChannel[channelId] = [];
        videosByChannel[channelId].push({ docId: newDocRef.id, createdAt: now });
      }
    }

    // 2. NETTOYAGE : Ne garder que les 5 vidéos les plus récentes par chaîne
    for (const channelId in videosByChannel) {
      const videos = videosByChannel[channelId];
      
      // Trier du plus récent au plus ancien
      videos.sort((a, b) => b.createdAt - a.createdAt);

      // Si on a plus de 5 vidéos, on supprime tout ce qui dépasse
      if (videos.length > 5) {
        const videosToDelete = videos.slice(5); // On garde de 0 à 4, on prend le reste
        for (const v of videosToDelete) {
          await deleteDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', v.docId));
          deletedCount++;
        }
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Synchronisation terminée. ${addedCount} nouveautés, ${deletedCount} anciennes supprimées.` 
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
