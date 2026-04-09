const fs = require('fs');
const path = require('path');

const firebaseConfigModule = `
/**
 * firebase-config.js
 * Generado automaticamente por Vercel durante el proceso de build
 * basandose en las Variables de Entorno.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';

export const firebaseConfig = {
  apiKey: "${process.env.FIREBASE_API_KEY || ''}",
  authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || ''}",
  projectId: "${process.env.FIREBASE_PROJECT_ID || ''}",
  storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET || ''}",
  messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID || ''}",
  appId: "${process.env.FIREBASE_APP_ID || ''}",
  measurementId: "${process.env.FIREBASE_MEASUREMENT_ID || ''}"
};

export const messagingVapidKey = "${process.env.FIREBASE_VAPID_KEY || ''}";
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export let analytics = null;

if (firebaseConfig.measurementId) {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      analytics = null;
    });
}
`;

const firebaseMessagingServiceWorker = `
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

firebase.initializeApp({
  apiKey: "${process.env.FIREBASE_API_KEY || ''}",
  authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || ''}",
  projectId: "${process.env.FIREBASE_PROJECT_ID || ''}",
  storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET || ''}",
  messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID || ''}",
  appId: "${process.env.FIREBASE_APP_ID || ''}"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  if (payload?.notification) {
    return;
  }

  const title = payload?.data?.title || 'HouseBoard';
  const options = {
    body: payload?.data?.body || '',
    icon: payload?.data?.icon || '/assets/icon.png',
    badge: payload?.data?.badge || '/assets/icon.png',
    data: {
      link: payload?.data?.link || '/',
    },
    tag: payload?.data?.type || 'houseboard-notification',
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const baseUrl = self.location.origin;
  const data = event.notification?.data || {};
  const targetUrl = new URL(data.link || '/', baseUrl).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url, baseUrl);
        if (clientUrl.origin === baseUrl && 'focus' in client) {
          if (client.url === targetUrl) {
            return client.focus();
          }
          if ('navigate' in client) {
            client.focus();
            return client.navigate(targetUrl);
          }
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
`;

const jsDir = path.join(__dirname, 'js');
if (!fs.existsSync(jsDir)) {
  fs.mkdirSync(jsDir);
}

fs.writeFileSync(path.join(jsDir, 'firebase-config.js'), firebaseConfigModule.trim());
fs.writeFileSync(
  path.join(__dirname, 'firebase-messaging-sw.js'),
  firebaseMessagingServiceWorker.trim()
);

console.log('firebase-config.js y firebase-messaging-sw.js generados exitosamente por el build script.');
