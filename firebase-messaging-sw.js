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
      // Intentar encontrar una pestaña que ya pertenezca a la app
      for (const client of clientList) {
        const clientUrl = new URL(client.url, baseUrl);
        if (clientUrl.origin === baseUrl && 'focus' in client) {
          // Si el cliente está en la URL exacta, solo focus
          if (client.url === targetUrl) {
            return client.focus();
          }
          // Si es otra página de la app, navegar y focus
          if ('navigate' in client) {
            client.focus();
            return client.navigate(targetUrl);
          }
        }
      }

      // Si no hay pestañas abiertas, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
