import { Check, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { FullScreenLoading } from '../auth/guards'
import { IosInstallSteps } from '../components/InstallPrompt'
import { useToast } from '../components/Toast'
import { Alert, Button, TextField } from '../components/ui'
import { cx } from '../lib/cx'
import { isIos, isStandalone } from '../lib/platform'
import { dayKey } from '../lib/time'
import { useNow } from '../lib/useNow'
import type { Semester } from '../lib/types'
import {
  blockProblem,
  itemProblem,
  type ParsedSchedule,
  type ScheduleBlock,
  type ScheduleItem,
  type ScheduleStep,
} from '../../supabase/functions/_shared/schedule-types'
import { blockFromRow, importCalendar, itemFromRow, useMySchedule, useSaveStep, useScheduleStatus, type MySchedule } from './api'
import { BlocksEditor } from './BlocksEditor'
import { InputBox } from './InputBox'
import { ItemsEditor } from './ItemsEditor'

const STEPS: { key: ScheduleStep; title: string }[] = [
  { key: 'classes', title: 'Classes' },
  { key: 'exams', title: 'Exams' },
  { key: 'obligations', title: 'Weekly obligations' },
]

/** Three-step schedule setup. The calendar stays locked until all three are saved. */
export default function SetupPage() {
  const status = useScheduleStatus()
  const schedule = useMySchedule(status.semester?.id)
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'

  if (status.loading || (status.semester && schedule.isPending)) return <FullScreenLoading />
  if (!status.semester) return <Navigate to="/" replace />

  const done = {
    classes: !!status.submission?.classes_done_at,
    exams: !!status.submission?.exams_done_at,
    obligations: !!status.submission?.obligations_done_at,
  }
  const requested = Number(params.get('step'))
  const firstOpen = STEPS.findIndex((s) => !done[s.key])
  const initial = requested >= 1 && requested <= 3 ? requested - 1 : Math.max(0, firstOpen)

  return (
    <Wizard
      key={`${status.semester.id}-${initial}`}
      semester={status.semester}
      schedule={schedule.data ?? { blocks: [], items: [] }}
      done={done}
      initialStep={initial}
      editing={editing}
      canvasUrl={status.submission?.canvas_feed_url ?? ''}
    />
  )
}

function Wizard({
  semester,
  schedule,
  done,
  initialStep,
  editing,
  canvasUrl,
}: {
  semester: Semester
  schedule: MySchedule
  done: Record<ScheduleStep, boolean>
  initialStep: number
  editing: boolean
  canvasUrl: string
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const save = useSaveStep()
  const [index, setIndex] = useState(initialStep)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const step = STEPS[index].key

  const [classes, setClasses] = useState<ScheduleBlock[]>(() => schedule.blocks.filter((b) => b.kind === 'class').map(blockFromRow))
  const [obligations, setObligations] = useState<ScheduleBlock[]>(() => schedule.blocks.filter((b) => b.kind === 'obligation').map(blockFromRow))
  const [exams, setExams] = useState<ScheduleItem[]>(() => schedule.items.filter((i) => i.kind !== 'obligation').map(itemFromRow))
  const [oneOffs, setOneOffs] = useState<ScheduleItem[]>(() => schedule.items.filter((i) => i.kind === 'obligation').map(itemFromRow))
  const [canvas, setCanvas] = useState(canvasUrl)
  const [notes, setNotes] = useState<string[]>([])

  const today = dayKey(useNow())
  const defaultDate = today < semester.starts_on ? semester.starts_on : today

  const problems = useMemo(() => {
    if (step === 'classes') return classes.map(blockProblem).filter(Boolean)
    if (step === 'exams') return exams.filter((i) => !i.dismissed).map(itemProblem).filter(Boolean)
    return [...obligations.map(blockProblem), ...oneOffs.map(itemProblem)].filter(Boolean)
  }, [step, classes, exams, obligations, oneOffs])

  const empty =
    step === 'classes' ? classes.length === 0 : step === 'exams' ? exams.every((i) => i.dismissed) : obligations.length === 0 && oneOffs.length === 0

  const goTo = (next: number) => {
    setIndex(next)
    setNotes([])
    setError(null)
    setConfirmEmpty(false)
    window.scrollTo({ top: 0 })
  }

  const submit = async () => {
    setError(null)
    if (problems.length) {
      setError('Fix the highlighted rows first.')
      return
    }
    if (empty && !confirmEmpty) {
      setConfirmEmpty(true)
      return
    }
    try {
      await save.mutateAsync(
        step === 'classes'
          ? { step, blocks: classes }
          : step === 'exams'
            ? { step, items: exams, canvasUrl: exams.some((i) => i.source === 'canvas') ? canvas : null }
            : { step, blocks: obligations, items: oneOffs },
      )
      if (editing) {
        toast('Schedule saved')
        navigate('/me/schedule', { replace: true })
      } else if (index < STEPS.length - 1) {
        goTo(index + 1)
      } else {
        toast('You’re all set')
        navigate('/', { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Try again.')
    }
  }

  const applyParsed = (parsed: ParsedSchedule) => {
    setNotes(parsed.notes)
    if (step === 'classes') setClasses(parsed.blocks)
    if (step === 'exams') setExams(parsed.items)
    if (step === 'obligations') {
      if (parsed.blocks.length) setObligations(parsed.blocks)
      if (parsed.items.length) setOneOffs(parsed.items)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-safe backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <p className="text-xs font-bold tracking-wide text-slate-600 uppercase">{semester.name} schedule</p>
          <h1 className="text-xl font-bold">{editing ? `Edit ${STEPS[index].title.toLowerCase()}` : 'Set up your schedule'}</h1>
          {!editing && (
            <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => (i <= index || done[s.key] ? goTo(i) : undefined)}
                    aria-current={i === index ? 'step' : undefined}
                    className={cx(
                      'flex w-full flex-col items-start gap-1 rounded-lg border-b-4 pb-1 text-left text-xs font-bold',
                      i === index ? 'border-brand-700 text-brand-700' : done[s.key] ? 'border-green-700 text-green-800' : 'border-slate-200 text-slate-600',
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {done[s.key] && i !== index ? <Check aria-label="Done" className="size-4" /> : `${i + 1}.`} {s.title}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 pb-12">
        {!editing && index === 0 && isIos() && !isStandalone() && (
          <details className="rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-100">
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-bold text-brand-900">
              <Smartphone aria-hidden className="size-5" /> Add the app to your Home Screen first
            </summary>
            <div className="mt-3">
              <IosInstallSteps />
            </div>
          </details>
        )}

        {step === 'classes' && (
          <>
            <p className="text-slate-800">
              Take a screenshot of your schedule in <strong>ONE.UF</strong> (Student Schedule) and add it below, or type your classes. Check the
              list it makes, fix anything wrong, then save.
            </p>
            <InputBox step="classes" semesterId={semester.id} placeholder={'COP3502 MWF period 4\nMAC2312 TR 9:35-10:50'} onParsed={applyParsed} />
            <Notes notes={notes} />
            <h2 className="text-lg font-bold">Your classes</h2>
            <BlocksEditor blocks={classes} onChange={setClasses} noun="class" showCategory={false} />
          </>
        )}

        {step === 'exams' && (
          <ExamsStep semester={semester} exams={exams} setExams={setExams} canvas={canvas} setCanvas={setCanvas} notes={notes} onParsed={applyParsed} defaultDate={defaultDate} />
        )}

        {step === 'obligations' && (
          <>
            <p className="text-slate-800">
              Add anything else that fills your week: a job, org meetings, practices, rehearsals. Type it, add a photo, or import a calendar file.
            </p>
            <InputBox step="obligations" semesterId={semester.id} placeholder={'Work at Publix Thursdays 6-10pm\nClub soccer Tue/Thu 7-8:30pm'} onParsed={applyParsed} />
            <CalendarImport step="obligations" semesterId={semester.id} onParsed={applyParsed} />
            <Notes notes={notes} />
            <h2 className="text-lg font-bold">Every week</h2>
            <BlocksEditor blocks={obligations} onChange={setObligations} noun="obligation" showCategory />
            <ItemsEditor items={oneOffs} onChange={setOneOffs} mode="obligations" defaultDate={defaultDate} />
          </>
        )}

        {confirmEmpty && (
          <Alert kind="info">
            {step === 'classes' ? 'Save with no classes?' : step === 'exams' ? 'Save with no exams?' : 'Save with no obligations?'} Tap save
            again to confirm.
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          {index > 0 && !editing && (
            <Button variant="secondary" className="flex-1" onClick={() => goTo(index - 1)}>
              Back
            </Button>
          )}
          {editing && (
            <Button variant="secondary" className="flex-1" onClick={() => navigate('/me/schedule')}>
              Cancel
            </Button>
          )}
          <Button className="flex-1" busy={save.isPending} onClick={() => void submit()}>
            {editing ? 'Save' : index < STEPS.length - 1 ? 'Save and continue' : 'Save and finish'}
          </Button>
        </div>
      </main>
    </div>
  )
}

function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <Alert kind="info">
      <ul className="list-disc pl-4">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="mt-1">Check the list below before saving.</p>
    </Alert>
  )
}

type ExamSource = 'canvas' | 'file' | 'type'

function ExamsStep({
  semester,
  exams,
  setExams,
  canvas,
  setCanvas,
  notes,
  onParsed,
  defaultDate,
}: {
  semester: Semester
  exams: ScheduleItem[]
  setExams: (items: ScheduleItem[]) => void
  canvas: string
  setCanvas: (url: string) => void
  notes: string[]
  onParsed: (parsed: ParsedSchedule) => void
  defaultDate: string
}) {
  const { member } = useAuth()
  const [source, setSource] = useState<ExamSource>('canvas')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importCanvas = async () => {
    setBusy(true)
    setError(null)
    try {
      onParsed(await importCalendar({ step: 'exams', source: 'canvas', url: canvas, memberId: member!.id, semesterId: semester.id }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t import that feed.')
    } finally {
      setBusy(false)
    }
  }

  const tabs: { key: ExamSource; label: string }[] = [
    { key: 'canvas', label: 'Canvas feed' },
    { key: 'file', label: 'Calendar file or link' },
    { key: 'type', label: 'Type or photo' },
  ]

  return (
    <>
      <p className="text-slate-800">Add your exams so the chapter knows which nights you&rsquo;re busy. Pick one way:</p>
      <div role="tablist" aria-label="How to add exams" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={source === t.key}
            onClick={() => setSource(t.key)}
            className={cx('min-h-12 rounded-lg px-1 text-sm font-bold', source === t.key ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
          >
            {t.label}
            {t.key === 'canvas' && <span className="block text-[11px] font-semibold text-green-800">Recommended</span>}
          </button>
        ))}
      </div>

      {source === 'canvas' && (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          <ol className="list-decimal pl-5 text-slate-800">
            <li>Open Canvas (ufl.instructure.com) in a browser and go to <strong>Calendar</strong>.</li>
            <li>
              Tap <strong>Calendar Feed</strong> (bottom of the right side; on a phone, use the browser&rsquo;s desktop site).
            </li>
            <li>Copy the link and paste it here. It updates every day, so new exams show up on their own.</li>
          </ol>
          <TextField
            label="Canvas calendar feed link"
            type="url"
            inputMode="url"
            placeholder="https://ufl.instructure.com/feeds/calendars/user_….ics"
            value={canvas}
            onChange={(e) => setCanvas(e.target.value)}
          />
          <Button busy={busy} disabled={!canvas.trim()} onClick={() => void importCanvas()}>
            Import from Canvas
          </Button>
          {error && <Alert>{error}</Alert>}
        </div>
      )}
      {source === 'file' && <CalendarImport step="exams" semesterId={semester.id} onParsed={onParsed} open />}
      {source === 'type' && (
        <InputBox step="exams" semesterId={semester.id} placeholder={'COP3502 Exam 2, Oct 21, 8:20-10:10pm\nMAC2312 midterm Nov 4'} onParsed={onParsed} />
      )}
      <Notes notes={notes} />
      <ItemsEditor items={exams} onChange={setExams} mode="exams" defaultDate={defaultDate} />
    </>
  )
}

/** Import from an .ics file or a public calendar link (e.g. Google Calendar). */
function CalendarImport({
  step,
  semesterId,
  onParsed,
  open = false,
}: {
  step: 'exams' | 'obligations'
  semesterId: string
  onParsed: (parsed: ParsedSchedule) => void
  open?: boolean
}) {
  const { member } = useAuth()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (args: { url?: string; file?: File }) => {
    setBusy(true)
    setError(null)
    try {
      onParsed(await importCalendar({ step, source: args.file ? 'ics_file' : 'ics_url', ...args, memberId: member!.id, semesterId }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t import that calendar.')
    } finally {
      setBusy(false)
    }
  }

  const body = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-700">
        In Google Calendar on a computer: Settings, pick the calendar, then <strong>Export</strong> (a .ics file) or copy the{' '}
        <strong>Public address in iCal format</strong>.
      </p>
      <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 font-semibold text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50">
        {busy ? 'Importing…' : 'Choose a .ics file'}
        <input
          type="file"
          accept=".ics,text/calendar"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void run({ file })
            e.target.value = ''
          }}
        />
      </label>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label="Or paste a calendar link" type="url" inputMode="url" placeholder="https://calendar.google.com/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <Button variant="secondary" busy={busy} disabled={!url.trim()} onClick={() => void run({ url })}>
          Import
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  )

  if (open) return <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">{body}</div>
  return (
    <details className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
      <summary className="min-h-10 cursor-pointer py-2 font-semibold">Import a calendar instead</summary>
      <div className="mt-2">{body}</div>
    </details>
  )
}
