/* FSE eIRN — push notification service worker */
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC3sKMm02GnikBdgXPd4RUm7RxnsR90A_I",
  authDomain: "fse-irn-system.firebaseapp.com",
  projectId: "fse-irn-system",
  storageBucket: "fse-irn-system.firebasestorage.app",
  messagingSenderId: "1097944808267",
  appId: "1:1097944808267:web:d8f1f3a52e2223253f86ce"
});

var messaging = firebase.messaging();

/* Data-only messages arrive here when the app is closed or in background */
messaging.onBackgroundMessage(function(payload) {
  var d = (payload && payload.data) || {};
  var title = d.title || 'FSE eIRN';
  var body = d.body || 'You have a new message';
  if (navigator.setAppBadge) { navigator.setAppBadge().catch(function(){}); }
  return self.registration.showNotification(title, {
    body: body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: d.url || './' },
    tag: 'fse-eirn-' + (d.tag || Date.now()),
    silent: false,
    renotify: true,
    vibrate: [600, 150, 600, 150, 800]
  });
});

/* Tapping the notification opens (or focuses) the app */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) { list[i].navigate(url); return list[i].focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
