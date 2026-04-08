importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

firebase.initializeApp({
  apiKey: 'AIzaSyBclYqbTpUWirHwA6VhhxKXvAVZBeJKOuA',
  authDomain: 'lr-home.firebaseapp.com',
  projectId: 'lr-home',
  storageBucket: 'lr-home.firebasestorage.app',
  messagingSenderId: '756918045501',
  appId: '1:756918045501:web:71d041a859344a85159354',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
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

  const targetUrl = new URL(
    event.notification?.data?.link || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
