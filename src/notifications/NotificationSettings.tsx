import { BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IosInstallSteps } from '../components/InstallPrompt'
import { useToast } from '../components/Toast'
import { Alert, Button } from '../components/ui'
import { currentSubscription, disablePush, enablePush, pushSupport } from './push'

const DEMO = !!import.meta.env.VITE_DEMO

/** "Turn on notifications" with the iPhone home-screen walkthrough when needed. */
export function NotificationSettings() {
  const toast = useToast()
  const support = DEMO ? 'demo' : pushSupport()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (support !== 'ok') return
    let live = true
    void currentSubscription()
      .then((sub) => live && setOn(!!sub && Notification.permission === 'granted'))
      .catch(() => live && setOn(false))
    return () => {
      live = false
    }
  }, [support])

  const toggle = async () => {
    setBusy(true)
    try {
      if (on) {
        await disablePush()
        setOn(false)
        toast('Notifications off on this device')
      } else {
        await enablePush()
        setOn(true)
        toast('Notifications on')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t change notifications', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="notify-title" className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 id="notify-title" className="flex items-center gap-2 text-lg font-bold">
        <BellRing aria-hidden className="size-5" /> Notifications
      </h2>
      <p className="text-slate-700">Reminders 24 hours and 1 hour before required events and events you&rsquo;re going to, plus chapter announcements.</p>
      {support === 'demo' && (
        <Alert kind="info">In this preview, notifications show up under the bell at the top. After launch they also arrive on your phone.</Alert>
      )}
      {support === 'needs-install' && (
        <>
          <p className="font-semibold">On iPhone, add the app to your Home Screen first:</p>
          <IosInstallSteps />
          <p className="text-sm text-slate-700">Then open it from your Home Screen, come back here and tap &ldquo;Turn on notifications&rdquo;.</p>
        </>
      )}
      {support === 'unsupported' && <p className="text-slate-700">This browser can&rsquo;t show notifications. You&rsquo;ll get them by email instead.</p>}
      {support === 'not-configured' && <p className="text-slate-700">Phone notifications aren&rsquo;t set up for this chapter yet. You&rsquo;ll get them by email instead.</p>}
      {support === 'ok' && on !== null && (
        <Button variant={on ? 'secondary' : 'primary'} busy={busy} onClick={() => void toggle()}>
          {on ? 'Turn off on this device' : 'Turn on notifications'}
        </Button>
      )}
      {support !== 'demo' && <p className="text-sm text-slate-600">If notifications are off, important ones come to your email.</p>}
    </section>
  )
}
