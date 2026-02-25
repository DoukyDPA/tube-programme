import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

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

    // 1. Récupérer TOUTES les vidéos existantes pour extraire les chaînes à surveiller
    const programsRef = collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs');
    const existingDocs = await getDocs(programsRef);
    
    const existingIds = new Set();
    const channelsToMonitor = new Map(); // Utilise une Map pour l'unicité des IDs de chaîne

    existingDocs.forEach(d => {
      const data = d.data();
      existingIds.add(data.youtubeId);
      // On stocke l'ID de la chaîne et sa catégorie associée
      if (data.channelId && data.categoryId) {
        channelsToMonitor.set(data.channelId, { 
          id: data.channelId, 
          category: data.categoryId,
          addedBy: data.addedBy || "system" 
        });
      }
    });

    let addedCount = 0;

    // 2. Scanner chaque chaîne identifiée
    for (const [channelId, channelInfo] of channelsToMonitor) {
      // Récupérer les dernières vidéos via la playlist "uploads" (ID de chaîne UC... devient UU...)
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
        
        // On garde le critère de durée (> 3 min) pour éviter les Shorts
        if (parseDuration(detail.contentDetails.duration) < 180) continue; 

        const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
        
        await setDoc(newDocRef, {
          id: newDocRef.id,
          youtubeId: vidId,
          channelId: channelId,
          categoryId: channelInfo.category,
          addedBy: channelInfo.addedBy,
          pitch: "",
          createdAt: Date.now(),
          avgScore: 0
        });
        
        addedCount++;
        existingIds.add(vidId);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Synchronisation terminée. ${addedCount} nouvelles vidéos ajoutées pour ${channelsToMonitor.size} chaînes surveillées.` 
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
