import { Download, Share, SquarePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isIos, isStandalone } from '../lib/platform'
import { Sheet } from './Sheet'
import { Button } from './ui'

const DISMISS_KEY = 'install-prompt-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Android/desktop Chrome install prompt, if the browser offered one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useInstallPrompt() {
  const [available, setAvailable] = useState(!!deferredPrompt)
  useEffect(() => {
    const update = () => setAvailable(!!deferredPrompt)
    listeners.add(update)
    return () => void listeners.delete(update)
  }, [])
  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    listeners.forEach((l) => l())
  }
  return { available, install }
}

export function IosInstallSteps() {
  return (
    <ol className="flex flex-col gap-4 text-base">
      <li className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 font-bold text-white">1</span>
        <span>
          Open this page in <strong>Safari</strong> and tap the <strong>Share</strong> button{' '}
          <Share aria-label="Share icon" className="inline size-5 align-text-bottom text-brand-700" /> (bottom of the screen on iPhone, top on iPad).
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 font-bold text-white">2</span>
        <span>
          Scroll down and tap <strong>Add to Home Screen</strong>{' '}
          <SquarePlus aria-label="Add icon" className="inline size-5 align-text-bottom text-brand-700" />.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 font-bold text-white">3</span>
        <span>
          Tap <strong>Add</strong>, then open the app from your home screen. Notifications only work from the home-screen app
          (iOS 16.4 or newer).
        </span>
      </li>
    </ol>
  )
}

/** First-visit walkthrough: iOS "Add to Home Screen" steps, or the native install prompt elsewhere. */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(readDismissed)
  const { available, install } = useInstallPrompt()
  const standalone = isStandalone()
  const ios = isIos()

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // private mode: just hide for this visit
    }
    setDismissed(true)
  }

  if (standalone || dismissed) return null

  if (ios) {
    return (
      <Sheet open onClose={dismiss} title="Add the app to your Home Screen" footer={<Button block onClick={dismiss}>Got it</Button>}>
        <p className="mb-4 text-slate-700">Install it like an app so it opens full screen and can send you reminders.</p>
        <IosInstallSteps />
      </Sheet>
    )
  }

  if (!available) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-safe-3">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200">
        <Download aria-hidden className="size-6 shrink-0 text-brand-700" />
        <p className="flex-1 text-sm font-medium">Install the app for quick access and reminders.</p>
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
        <Button onClick={() => void install().then(dismiss)}>Install</Button>
      </div>
    </div>
  )
}
