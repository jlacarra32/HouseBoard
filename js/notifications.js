import { app, db, messagingVapidKey } from './firebase-config.js';
import {
  doc,
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

    await setDoc(
      doc(db, 'homes', homeId, 'members', userName),
      {
        userName,
        fcmToken: token,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (didPrompt) {
      console.info('Notificaciones push activadas.');
    }
  } catch (error) {
    console.error('No se pudo inicializar FCM:', error);
  }
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
