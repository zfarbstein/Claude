import { ImagePlus, Sparkles, X } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button } from '../components/ui'
import type { ParsedSchedule, ScheduleStep } from '../../supabase/functions/_shared/schedule-types'
import { readSchedule } from './api'

const MAX_PHOTOS = 4

/** Text box + photos -> Claude reads them -> editable rows (nothing is saved here). */
export function InputBox({
  step,
  semesterId,
  placeholder,
  onParsed,
}: {
  step: ScheduleStep
  semesterId: string
  placeholder: string
  onParsed: (result: ParsedSchedule) => void
}) {
  const { member } = useAuth()
  const textId = useId()
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const addPhotos = (files: FileList | null) => {
    if (!files) return
    setPhotos((current) => [...current, ...Array.from(files)].slice(0, MAX_PHOTOS))
  }

  const read = async () => {
    setBusy(true)
    setError(null)
    try {
      onParsed(await readSchedule({ step, text, photos, memberId: member!.id, semesterId }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t read that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
      <label htmlFor={textId} className="text-sm font-semibold text-slate-800">
        Type it, add photos or screenshots, or both
      </label>
      <textarea
        id={textId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={8000}
        className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-base placeholder:text-slate-500 focus:border-brand-700 focus:ring-2 focus:ring-brand-700/30 focus:outline-none"
      />
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <li key={`${p.name}-${i}`} className="relative">
              <img src={previews[i]} alt={`Photo ${i + 1}`} className="size-20 rounded-lg object-cover ring-1 ring-slate-200" />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-slate-900 text-white"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {photos.length < MAX_PHOTOS && (
          <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 font-semibold text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50">
            <ImagePlus aria-hidden className="size-5" /> Add photo
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
          </label>
        )}
        <Button busy={busy} disabled={!text.trim() && photos.length === 0} onClick={() => void read()}>
          <Sparkles aria-hidden className="size-5" /> {busy ? 'Reading…' : 'Read it'}
        </Button>
      </div>
      {busy && <p className="text-sm text-slate-600">This can take up to a minute for photos.</p>}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}
