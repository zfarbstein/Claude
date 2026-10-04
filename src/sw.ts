/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }

// App shell only. API data (Supabase) is never cached, so nobody sees stale schedules or events.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

clientsClaim()

// ---------------------------------------------------------------------------
// Web Push (sent by the send-notifications Edge Function)
// ---------------------------------------------------------------------------
interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = (event.data?.json() as PushPayload) ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Chapter Calendar', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data as { url?: string } | null)?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        await open.navigate(url).catch(() => undefined)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
