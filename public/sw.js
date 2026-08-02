// Subir la versión al cambiar los íconos: al activarse, el SW borra las cachés
// viejas y vuelve a bajar los assets (si no, sirve los íconos anteriores).
const CACHE_NAME = 'expense-tracker-v4'
const ASSETS = ['/manifest.json', '/icon-192.png', '/icon-512.png']

// Instalar: precachear solo íconos/estáticos y activar de inmediato
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)))
  self.skipWaiting()
})

// Activar: borrar cachés viejas y tomar control de las pestañas abiertas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null))))
      .then(() => self.clients.claim())
  )
})

// Push notifications: el servidor manda { title, body, url, tag }
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Recordatorio', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Expense Tracker'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'expense-reminder',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Click en la notificación: enfocar una pestaña existente o abrir la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // No interceptar API ni pedidos que no sean GET (siempre datos frescos)
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) {
    return
  }

  // Navegación (HTML): primero la red, así siempre ves la última versión.
  // Si no hay internet, caemos a lo cacheado.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((r) => r || caches.match('/'))))
    return
  }

  // Resto (íconos, imágenes): caché primero, y si no está, red (y la guardamos)
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return res
        })
    )
  )
})
