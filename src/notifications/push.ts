import { cal } from '../lib/supabase'
import { isIos, isStandalone } from '../lib/platform'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushSupport = 'ok' | 'needs-install' | 'unsupported' | 'not-configured'

/** iPhones only get Web Push in the home-screen app (iOS 16.4+). */
export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!capable) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  return VAPID_PUBLIC_KEY ? 'ok' : 'not-configured'
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('Reload the app and try again.')
  return reg
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

async function save(sub: PushSubscription) {
  const keys = sub.toJSON().keys ?? {}
  const { error } = await cal.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh ?? '',
    p_auth: keys.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (error) throw new Error(error.message)
}

/** Asks for permission, subscribes this device and saves it for the signed-in member. */
export async function enablePush(): Promise<void> {
  if (pushSupport() !== 'ok') throw new Error('Notifications aren’t available here.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this app. Allow them in your phone or browser settings, then try again.'
        : 'Notifications weren’t turned on.',
    )
  }
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY!) }))
  await save(sub)
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await cal.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

/** Re-saves this device for whoever is signed in now (keys rotate; devices change hands). */
export async function resyncPush(): Promise<void> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await save(sub)
}
