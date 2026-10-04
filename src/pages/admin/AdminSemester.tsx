import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { Alert, Button, TextField } from '../../components/ui'
import { cal } from '../../lib/supabase'
import { formatLongDay, fromDayKey } from '../../lib/time'
import { scheduleKeys, useCurrentSemester, useSubmissionCounts } from '../../schedule/api'

export default function AdminSemester() {
  const semester = useCurrentSemester()
  const counts = useSubmissionCounts()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !startsOn || !endsOn) return setError('Fill in the name and both dates.')
    if (endsOn <= startsOn) return setError('The last day must be after the first day.')
    if (!confirm) return setConfirm(true)
    setBusy(true)
    const { error } = await cal.rpc('start_semester', { p_name: name.trim(), p_starts_on: startsOn, p_ends_on: endsOn })
    setBusy(false)
    setConfirm(false)
    if (error) return setError(error.message)
    toast(`${name.trim()} started`)
    setName('')
    setStartsOn('')
    setEndsOn('')
    void qc.invalidateQueries({ queryKey: scheduleKeys.semester })
    void qc.invalidateQueries({ queryKey: ['submission'] })
    void qc.invalidateQueries({ queryKey: scheduleKeys.counts })
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4">
      <section aria-labelledby="current-title" className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 id="current-title" className="text-lg font-bold">
          Current semester
        </h2>
        {semester.data ? (
          <>
            <p className="mt-1 text-2xl font-bold">{semester.data.name}</p>
            <p className="text-slate-700">
              {formatLongDay(fromDayKey(semester.data.starts_on))} to {formatLongDay(fromDayKey(semester.data.ends_on))}
            </p>
            {counts.data && (
              <p className="mt-3 text-lg">
                <strong className="tabular-nums">
                  {counts.data.submitted}/{counts.data.total}
                </strong>{' '}
                members have submitted their schedule
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-slate-700">No semester yet. Start one so members can submit their schedules.</p>
        )}
      </section>

      <section aria-labelledby="new-title" className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 id="new-title" className="text-lg font-bold">
          Start a new semester
        </h2>
        <p className="mt-1 text-sm text-slate-700">Everyone is asked to submit their schedule again the next time they open the app.</p>
        <form onSubmit={start} className="mt-3 flex flex-col gap-3" noValidate>
          <TextField label="Name" placeholder="Spring 2027" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="First day" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            <TextField label="Last day (after finals)" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
          {confirm && (
            <Alert kind="info">Start {name.trim()}? Every member will have to submit their schedule again. Tap the button again to confirm.</Alert>
          )}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} variant={confirm ? 'danger' : 'primary'}>
            {confirm ? `Yes, start ${name.trim()}` : 'Start semester'}
          </Button>
        </form>
      </section>
    </main>
  )
}
