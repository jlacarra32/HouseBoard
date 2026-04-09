import { db } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DEFAULT_NOTIFICATION_PREFS = {
  itemAdded: true,
  itemBought: true,
  taskAdded: true,
  taskDone: true,
};

export async function createHome(name, userName) {
  const homeId = doc(collection(db, 'homes')).id;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  await setDoc(doc(db, 'homes', homeId), {
    name,
    code,
    createdAt: serverTimestamp(),
    members: [userName]
  });

  await setDoc(doc(db, 'homes', homeId, 'members', userName), {
    userName,
    isOnline: false,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  return { homeId, code };
}

export async function joinHome(code, userName) {
  const q = query(collection(db, 'homes'), where('code', '==', code));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    throw new Error('Código de casa no válido o casa no encontrada.');
  }
  
  const homeDoc = snapshot.docs[0];
  const homeId = homeDoc.id;
  
  await updateDoc(doc(db, 'homes', homeId), {
    members: arrayUnion(userName)
  });

  await setDoc(doc(db, 'homes', homeId, 'members', userName), {
    userName,
    isOnline: false,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  return homeId;
}

export async function getHomesForUser(userName) {
  const q = query(collection(db, 'homes'), where('members', 'array-contains', userName));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
