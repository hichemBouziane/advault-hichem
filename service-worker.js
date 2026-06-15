// ==========================================
//  AdVault Service Worker
//  الإصدار: يغير عند كل تحديث للموقع
// ==========================================
const CACHE_NAME = 'advault-v1';

// الملفات اللي تتحفظ للعمل أوفلاين
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/client.html',
  '/analytics.html',
  '/calculator.html',
  '/css/index.css',
  '/css/admin.css',
  '/css/client.css',
  '/css/analytics.css',
  '/css/calculator.css',
  '/js/index.js',
  '/js/admin.js',
  '/js/client.js',
  '/js/analytics.js',
  '/js/calculator.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ===== تثبيت السيرفر ووركر وتخزين الملفات =====
self.addEventListener('install', (event) => {
  console.log('[AdVault SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[AdVault SW] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch((err) => {
      console.warn('[AdVault SW] Cache failed (some files may not exist yet):', err);
    })
  );
  self.skipWaiting();
});

// ===== تفعيل وحذف الكاش القديم =====
self.addEventListener('activate', (event) => {
  console.log('[AdVault SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[AdVault SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// ===== استراتيجية الشبكة أولاً، الكاش احتياطي =====
self.addEventListener('fetch', (event) => {
  // تجاهل طلبات Supabase والـ APIs الخارجية (تحتاج إنترنت دائماً)
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
        // حفظ نسخة جديدة في الكاش
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // إذا ما في إنترنت، رجّع من الكاش
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // صفحة أوفلاين احتياطية
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
