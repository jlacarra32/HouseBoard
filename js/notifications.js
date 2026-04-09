import { app, db, messagingVapidKey } from './firebase-config.js';
import {
  arrayUnion,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';

const SERVICE_WORKER_PATH = '/firebase-messaging-sw.js';
let foregroundListenerBound = false;
const MAX_FCM_TOKENS = 5;

export async function initPushNotifications(homeId, userName) {
  if (!homeId || !userName) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const messagingSupported = await isSupported().catch(() => false);
  if (!messagingSupported) return;

  if (!messagingVapidKey) {
    console.warn('FCM desactivado: falta FIREBASE_VAPID_KEY.');
    return;
  }

  const didPrompt = Notification.permission === 'default';
  const permission = didPrompt
    ? await Notification.requestPermission()
    : Notification.permission;

  if (permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
    
    // Esperar a que el service worker esté listo y activo
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);

    bindForegroundNotifications(messaging);

    const token = await getToken(messaging, {
      vapidKey: messagingVapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) return;

    await saveMemberFcmToken(homeId, userName, token);

    if (didPrompt) {
      console.info('Notificaciones push activadas.');
    }
  } catch (error) {
    console.error('No se pudo inicializar FCM:', error);
  }
}

async function saveMemberFcmToken(homeId, userName, rawToken) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!token) return;

  const memberRef = doc(db, 'homes', homeId, 'members', userName);
  const memberSnap = await getDoc(memberRef);
  const memberData = memberSnap.exists() ? (memberSnap.data() || {}) : {};
  const currentTokens = Array.isArray(memberData.fcmTokens)
    ? memberData.fcmTokens.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
  const legacyToken = typeof memberData.fcmToken === 'string' ? memberData.fcmToken.trim() : '';
  const mergedTokens = [...new Set([...currentTokens, legacyToken, token].filter(Boolean))];
  const trimmedTokens = mergedTokens.slice(-MAX_FCM_TOKENS);

  if (currentTokens.includes(token) && !legacyToken && currentTokens.length <= MAX_FCM_TOKENS) {
    await setDoc(
      memberRef,
      {
        userName,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  if (!currentTokens.includes(token) && !legacyToken && currentTokens.length < MAX_FCM_TOKENS) {
    await setDoc(
      memberRef,
      {
        userName,
        fcmTokens: arrayUnion(token),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  await setDoc(
    memberRef,
    {
      userName,
      fcmTokens: trimmedTokens,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function bindForegroundNotifications(messaging) {
  if (foregroundListenerBound) return;
  foregroundListenerBound = true;

  onMessage(messaging, (payload) => {
    if (Notification.permission !== 'granted') return;

    const title = payload?.data?.title || 'HouseBoard';
    const body = payload?.data?.body || '';
    const icon = payload?.data?.icon || '/assets/icon.png';
    const link = payload?.data?.link || '/';
    const notification = new Notification(title, {
      body,
      icon,
      data: { link },
    });

    notification.onclick = () => {
      window.focus();
      if (link) {
        window.location.assign(link);
      }
      notification.close();
    };
  });
}
