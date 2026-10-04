import { Plus, Trash2 } from 'lucide-react'
import { cx } from '../lib/cx'
import { itemProblem, type ScheduleItem } from '../../supabase/functions/_shared/schedule-types'

const input =
  'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-base focus:border-brand-700 focus:ring-2 focus:ring-brand-700/30 focus:outline-none'

/**
 * Editable list of dated items. Removing an item that came from a feed keeps it as
 * "dismissed" so the daily Canvas sync doesn't bring it back.
 */
export function ItemsEditor({
  items,
  onChange,
  mode,
  defaultDate,
}: {
  items: ScheduleItem[]
  onChange: (items: ScheduleItem[]) => void
  mode: 'exams' | 'obligations'
  defaultDate: string
}) {
  const update = (i: number, patch: Partial<ScheduleItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const remove = (i: number) =>
    onChange(items[i].external_uid ? items.map((it, j) => (j === i ? { ...it, dismissed: true } : it)) : items.filter((_, j) => j !== i))
  const add = () =>
    onChange([
      ...items,
      mode === 'exams'
        ? { kind: 'exam', title: '', course: null, date: defaultDate, start: '20:20', end: '22:10', all_day: false, source: 'manual' }
        : { kind: 'obligation', title: '', course: null, date: defaultDate, start: '18:00', end: '19:00', all_day: false, category: 'personal', source: 'manual' },
    ])

  const visible = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.dismissed)
  const groups =
    mode === 'exams'
      ? [
          { title: 'Exams (block your availability)', rows: visible.filter(({ it }) => it.kind === 'exam'), collapsible: false },
          { title: 'Deadlines (don’t block your availability)', rows: visible.filter(({ it }) => it.kind === 'deadline'), collapsible: true },
        ]
      : [{ title: 'One-time obligations', rows: visible, collapsible: false }]

  const row = ({ it, i }: { it: ScheduleItem; i: number }) => {
    const problem = itemProblem(it)
    return (
      <li key={i} className="flex flex-col gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input aria-label="Name" placeholder={mode === 'exams' ? 'Exam 2' : 'Career fair shift'} className={input} value={it.title} onChange={(e) => update(i, { title: e.target.value })} maxLength={160} />
          <button type="button" aria-label={`Remove ${it.title || 'item'}`} onClick={() => remove(i)} className="flex size-11 items-center justify-center rounded-lg text-red-700 hover:bg-red-50">
            <Trash2 aria-hidden className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
          <input aria-label="Date" type="date" className={input} value={it.date} onChange={(e) => update(i, { date: e.target.value })} />
          <input aria-label="Starts" type="time" className={input} value={it.start ?? ''} onChange={(e) => update(i, { start: e.target.value || null, all_day: !e.target.value })} />
          <input aria-label="Ends" type="time" className={input} value={it.end ?? ''} onChange={(e) => update(i, { end: e.target.value || null })} />
        </div>
        {mode === 'exams' ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input aria-label="Course" placeholder="Course (e.g. COP3502)" className={input} value={it.course ?? ''} onChange={(e) => update(i, { course: e.target.value || null })} maxLength={60} />
            <div role="group" aria-label="Type" className="flex rounded-lg bg-slate-100 p-0.5">
              {(['exam', 'deadline'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={it.kind === k} onClick={() => update(i, { kind: k })} className={cx('min-h-10 rounded-md px-2 text-sm font-bold capitalize', it.kind === k ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <select aria-label="Type" className={input} value={it.category ?? 'personal'} onChange={(e) => update(i, { category: e.target.value as 'school' | 'personal' })}>
            <option value="school">School / involvement</option>
            <option value="personal">Personal</option>
          </select>
        )}
        {problem && <p className="text-sm font-medium text-red-700">{problem}</p>}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) =>
        g.collapsible ? (
          g.rows.length > 0 && (
            <details key={g.title} className="rounded-xl bg-slate-50 p-2">
              <summary className="min-h-10 cursor-pointer px-1 py-2 font-semibold">
                {g.title}: {g.rows.length}
              </summary>
              <ul className="mt-2 flex flex-col gap-2">{g.rows.map(row)}</ul>
            </details>
          )
        ) : (
          <section key={g.title} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-slate-800">{g.title}</h3>
            {g.rows.length === 0 ? <p className="text-slate-600">None yet.</p> : <ul className="flex flex-col gap-2">{g.rows.map(row)}</ul>}
          </section>
        ),
      )}
      <button type="button" onClick={add} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 font-semibold text-brand-700">
        <Plus aria-hidden className="size-5" /> Add {mode === 'exams' ? 'an exam' : 'a one-time obligation'}
      </button>
    </div>
  )
}
