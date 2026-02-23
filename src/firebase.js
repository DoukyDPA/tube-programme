import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, updateDoc, arrayUnion, increment, addDoc, collection } from 'firebase/firestore';

// ... (config firebase existante)

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const FIREBASE_APP_ID = "tube-prog-v0";

// Fonction pour créer un thème personnalisé
export const createCustomTheme = async (userId, themeName, iconName) => {
  const themeRef = await addDoc(collection(db, 'categories'), {
    label: themeName,
    icon: iconName,
    createdBy: userId,
    isPublic: false,
    channels: [],
    createdAt: Date.now()
  });

  // Mise à jour du profil utilisateur
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    themeCount: increment(1),
    customThemes: arrayUnion(themeRef.id)
  });
  
  return themeRef.id;
};