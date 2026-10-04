import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useToast } from './Toast'

/** Offers a reload when a new version of the app has been deployed. */
export function UpdatePrompt() {
  const toast = useToast()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new deploy every hour while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60_000)
    },
  })

  useEffect(() => {
    if (needRefresh) {
      toast('A new version is ready.', 'info', { label: 'Reload', onClick: () => void updateServiceWorker(true) })
    }
  }, [needRefresh, toast, updateServiceWorker])

  return null
}
