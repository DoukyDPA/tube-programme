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
    
    const channelsToMonitor = new Map();
    const videosByChannel = {}; 

    existingDocs.forEach(d => {
      const data = d.data();
      if (data.channelId) {
        if (!videosByChannel[data.channelId]) videosByChannel[data.channelId] = [];
        videosByChannel[data.channelId].push({ docId: d.id, youtubeId: data.youtubeId });

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

    for (const [channelId, channelInfo] of channelsToMonitor) {
      const playlistId = channelId.replace(/^UC/, 'UU');
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY}&playlistId=${playlistId}&part=contentDetails&maxResults=50`);
      const vData = await vRes.json();
      
      if (!vData.items) continue;

      const top5 = [];
      const videoIds = vData.items.map(v => v.contentDetails.videoId).join(',');
      // On ajoute snippet pour récupérer title/channelTitle/publishedAt sans
      // coût quota supplémentaire (1 unité par appel quel que soit le nombre
      // de "part").
      const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=contentDetails,snippet`);
      const detailsData = await detailsRes.json();

      for (const v of vData.items) {
        const vidId = v.contentDetails.videoId;
        const detail = detailsData.items?.find(d => d.id === vidId);

        if (detail && parseDuration(detail.contentDetails.duration) >= 180) {
           top5.push({
             youtubeId: vidId,
             title: detail.snippet?.title || '',
             creatorName: detail.snippet?.channelTitle || '',
             publishedAt: detail.snippet?.publishedAt
               ? new Date(detail.snippet.publishedAt).getTime()
               : Date.now(),
           });
           if (top5.length === 5) break;
        }
      }
      const top5Ids = top5.map(v => v.youtubeId);

      const existingForChannel = videosByChannel[channelId] || [];
      const existingIdsForChannel = existingForChannel.map(v => v.youtubeId);

      for (const v of top5) {
        if (!existingIdsForChannel.includes(v.youtubeId)) {
          const newDocRef = doc(collection(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs'));
          await setDoc(newDocRef, {
            id: newDocRef.id,
            youtubeId: v.youtubeId,
            channelId: channelId,
            categoryId: channelInfo.category,
            addedBy: channelInfo.addedBy,
            pitch: "",
            createdAt: Date.now(),
            avgScore: 0,
            // Métadonnées YouTube stockées au sync pour éviter l'hydratation client
            title: v.title,
            creatorName: v.creatorName,
            publishedAt: v.publishedAt
          });
          addedCount++;
        }
      }

      for (const existingVid of existingForChannel) {
        if (!top5Ids.includes(existingVid.youtubeId)) {
          await deleteDoc(doc(db, 'artifacts', FIREBASE_APP_ID, 'public', 'data', 'programs', existingVid.docId));
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
