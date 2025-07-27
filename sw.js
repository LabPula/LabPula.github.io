const CACHE_NAME = 'gtd-task-manager-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('Cache installation failed:', error);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        
        // Clone the request because it's a stream
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response because it's a stream
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        }).catch(() => {
          // Return offline page or cached content for navigation requests
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Background sync for task updates (when coming back online)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Sync tasks when coming back online
      console.log('Background sync triggered')
    );
  }
});

// Handle share target (when other apps share to this PWA)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname === '/' && url.searchParams.has('title')) {
    event.respondWith(
      (async () => {
        const title = url.searchParams.get('title') || '';
        const text = url.searchParams.get('text') || '';
        const sharedUrl = url.searchParams.get('url') || '';
        
        // Store shared content in cache for the main app to pick up
        const cache = await caches.open(CACHE_NAME);
        const sharedData = {
          title,
          text,
          url: sharedUrl,
          timestamp: Date.now()
        };
        
        await cache.put(
          '/shared-content',
          new Response(JSON.stringify(sharedData), {
            headers: { 'Content-Type': 'application/json' }
          })
        );
        
        return Response.redirect('/', 302);
      })()
    );
  }
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Task reminder',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: 'task-reminder',
    renotify: true,
    requireInteraction: true,
    actions: [
      {
        action: 'mark-complete',
        title: 'Mark Complete',
        icon: '/check-icon.png'
      },
      {
        action: 'snooze',
        title: 'Snooze',
        icon: '/snooze-icon.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('GTD Task Manager', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'mark-complete') {
    // Handle mark complete action
    event.waitUntil(
      clients.openWindow('/?action=complete&taskId=' + event.notification.tag)
    );
  } else if (event.action === 'snooze') {
    // Handle snooze action
    event.waitUntil(
      clients.openWindow('/?action=snooze&taskId=' + event.notification.tag)
    );
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
