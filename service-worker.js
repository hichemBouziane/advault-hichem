// ==========================================
//  AdVault Service Worker (PWA + Native Notifications)
//  الإصدار: v2.0 - دعم تطبيق الهاتف والإشعارات الفورية
// ==========================================
const CACHE_NAME = 'advault-v2';

// الملفات الأساسية للعمل السريع
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html',
  '/client.html',
  '/analytics.html',
  '/calculator.html',
  '/css/index.css',
  '/css/admin.css',
  '/css/client.css',
  '/js/config.js',
  '/js/index.js',
  '/js/admin.js',
  '/js/client.js',
  '/js/analytics.js',
  '/js/mobile-app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ===== تثبيت السيرفر ووركر وتخزين الملفات =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch((err) => {
      console.warn('[AdVault SW] Cache warning:', err);
    })
  );
  self.skipWaiting();
});

// ===== تفعيل وحذف الكاش القديم =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ===== استقبال وإظهار إشعارات الهاتف (Push & Local Notifications) =====
self.addEventListener('push', (event) => {
  let payload = {
    title: 'تنبيه من منصة AdVault 🔔',
    body: 'لديك تحديث جديد في حسابك الإعلاني.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    url: '/client.html'
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = { ...payload, ...data };
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icons/icon-192.png',
      badge: payload.badge || '/icons/icon-96.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200, 100, 300],
      data: { url: payload.url || '/client.html' }
    })
  );
});

// استقبال أمر إظهار إشعار مباشر من التطبيق (Message from Page)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, url, tag } = event.data;
    self.registration.showNotification(title || 'AdVault 🔔', {
      body: body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      dir: 'rtl',
      lang: 'ar',
      tag: tag || 'advault-alert-' + Date.now(),
      renotify: true,
      vibrate: [250, 100, 250, 100, 400],
      data: { url: url || '/client.html' }
    });
  }
});

// عند ضغط المستخدم على الإشعار في شريط الهاتف العلوي
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/client.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ===== استراتيجية الشبكة أولاً، الكاش احتياطي =====
self.addEventListener('fetch', (event) => {
  if (
    event.request.url.includes('supabase.co') ||
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('generativelanguage') ||
    event.request.url.includes('docs.google.com') ||
    event.request.url.includes('cdn.') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
