import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { fetchEvent } from '../calendar/api'
import { Alert, Spinner } from '../components/ui'
import { inChapterTz } from '../lib/time'
import { useNow } from '../lib/useNow'
import { useCheckinCode } from './api'

/** Full-screen rotating QR code for the door. A new code every 30 seconds; the screen stays on. */
export default function CheckinCodePage() {
  const { eventId = '' } = useParams()
  const event = useQuery({ queryKey: ['event', eventId], queryFn: () => fetchEvent(eventId) })
  const code = useCheckinCode(eventId)
  const now = useNow(1000)
  const [qr, setQr] = useState<string | null>(null)
  const current = code.data?.code ?? null
  const link = current ? `${window.location.origin}/checkin?e=${eventId}&c=${current}` : null

  useEffect(() => {
    if (!link) return
    let live = true
    void QRCode.toDataURL(link, { margin: 1, width: 640, errorCorrectionLevel: 'M' }).then((url) => live && setQr(url))
    return () => {
      live = false
    }
  }, [link])

  // Keep the screen on while the code is showing (where supported).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
    void nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined)
    return () => void lock?.release().catch(() => undefined)
  }, [])

  const secondsLeft = code.data ? Math.max(0, Math.ceil((Date.parse(code.data.expires_at) - now.getTime()) / 1000)) : 0

  return (
    <main className="flex min-h-dvh flex-col items-center gap-4 bg-white px-4 pt-safe pb-safe text-center">
      <div className="flex w-full max-w-md items-center justify-between pt-3">
        <Link to={`/attendance/${eventId}`} className="flex min-h-11 items-center rounded-lg px-2 font-semibold text-brand-700">
          Roster
        </Link>
        <span className="text-sm text-slate-600">Scan with the app or your camera</span>
      </div>
      <h1 className="text-2xl font-bold">{event.data?.title ?? 'Check in'}</h1>
      {code.isError && <Alert>{code.error.message}</Alert>}
      {code.isPending && <Spinner className="size-8 text-brand-700" />}
      {code.data && !current && (
        <Alert kind="info">
          {now.getTime() < Date.parse(code.data.opens_at)
            ? `Check-in opens at ${format(inChapterTz(code.data.opens_at), 'h:mm a')} (15 minutes before the start).`
            : 'Check-in for this event has closed.'}
        </Alert>
      )}
      {current && (
        <>
          {qr ? <img src={qr} alt={`Check-in QR code. Code ${current}`} className="aspect-square w-full max-w-md rounded-2xl ring-1 ring-slate-200" /> : <Spinner />}
          <p className="text-sm font-semibold text-slate-600">Or enter this code in the app</p>
          <p className="font-mono text-5xl font-bold tracking-[0.3em] tabular-nums" data-testid="checkin-code">
            {current}
          </p>
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <div className="h-full bg-brand-700 transition-[width] duration-1000 ease-linear" style={{ width: `${(secondsLeft / 30) * 100}%` }} />
          </div>
          <p className="text-sm text-slate-600" aria-live="off">
            New code in {secondsLeft}s
          </p>
        </>
      )}
    </main>
  )
}
