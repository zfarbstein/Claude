import { Camera, CameraOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '../components/AppLayout'
import { Alert, Button, Select, TextField } from '../components/ui'
import { formatTimeRange } from '../lib/time'
import { checkIn, parseCheckinUrl, useOpenCheckins } from './api'

type Detector = (frame: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>

/** Native BarcodeDetector where the phone has it (Android Chrome), jsQR everywhere else (iPhone). */
async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
  if (Native) {
    const detector = new Native({ formats: ['qr_code'] })
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
  }
  const { default: jsQR } = await import('jsqr')
  return async (video, canvas) => {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    const scale = Math.min(1, 720 / Math.max(w, h))
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

/** In-app check-in: scan the QR code at the door, or type the 6-digit code under it. */
export default function ScanPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [camera, setCamera] = useState<'off' | 'starting' | 'on' | 'error'>('off')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const open = useOpenCheckins()
  const [eventId, setEventId] = useState(params.get('event') ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (camera !== 'starting') return
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t use the camera. Type the code instead.')
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        const detect = await makeDetector()
        setCamera('on')
        const tick = async () => {
          if (stopped) return
          const text = await detect(video, canvasRef.current!).catch(() => null)
          const hit = text ? parseCheckinUrl(text) : null
          if (hit) {
            void navigate(`/checkin?e=${encodeURIComponent(hit.eventId)}&c=${encodeURIComponent(hit.code)}`)
            return
          }
          timer = setTimeout(() => void tick(), 250)
        }
        void tick()
      } catch (e) {
        if (stopped) return
        setCamera('error')
        setCameraError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your settings, or type the code instead.'
            : e instanceof Error
              ? e.message
              : 'Couldn’t start the camera. Type the code instead.',
        )
      }
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [camera, navigate])

  const events = open.data ?? []
  const selected = eventId || (events.length === 1 ? events[0].id : '')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selected) return setError('Pick the event you’re at.')
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code shown at the door.')
    setBusy(true)
    try {
      const result = await checkIn(selected, code.trim())
      if (result.ok) void navigate('/checkin', { replace: true, state: { result } })
      else setError(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t check in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Check in" back="/" />
      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-4">
        <section aria-labelledby="scan-title" className="flex flex-col gap-3">
          <h2 id="scan-title" className="text-lg font-bold">
            Scan the code at the door
          </h2>
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-900">
            <video ref={videoRef} playsInline muted className={camera === 'on' ? 'size-full object-cover' : 'hidden'} />
            {camera !== 'on' && (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
                {camera === 'error' ? <CameraOff aria-hidden className="size-10" /> : <Camera aria-hidden className="size-10" />}
                {camera === 'error' ? (
                  <p>{cameraError}</p>
                ) : (
                  <Button onClick={() => setCamera('starting')} busy={camera === 'starting'}>
                    Start camera
                  </Button>
                )}
              </div>
            )}
            {camera === 'on' && <div aria-hidden className="pointer-events-none absolute inset-[15%] rounded-2xl border-4 border-white/80" />}
          </div>
          <canvas ref={canvasRef} hidden />
        </section>

        <section aria-labelledby="code-title" className="flex flex-col gap-3">
          <h2 id="code-title" className="text-lg font-bold">
            Or type the code
          </h2>
          {open.data && events.length === 0 && <Alert kind="info">No events are open for check-in right now. Check-in opens 15 minutes before an event starts.</Alert>}
          {events.length > 0 && (
            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
              <Select label="Event" value={selected} onChange={(e) => setEventId(e.target.value)}>
                {events.length > 1 && <option value="">Pick an event</option>}
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({formatTimeRange(ev)})
                  </option>
                ))}
              </Select>
              <TextField
                label="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-2xl tracking-[0.3em]"
              />
              {error && <Alert>{error}</Alert>}
              <Button type="submit" busy={busy}>
                Check in
              </Button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
