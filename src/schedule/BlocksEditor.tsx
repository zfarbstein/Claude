import { Plus, Trash2 } from 'lucide-react'
import { blockProblem, WEEKDAY_NAMES, type ScheduleBlock } from '../../supabase/functions/_shared/schedule-types'

const input =
  'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-base focus:border-brand-700 focus:ring-2 focus:ring-brand-700/30 focus:outline-none'

/** Editable list of weekly blocks (classes or obligations). */
export function BlocksEditor({
  blocks,
  onChange,
  noun,
  showCategory,
}: {
  blocks: ScheduleBlock[]
  onChange: (blocks: ScheduleBlock[]) => void
  noun: string
  showCategory: boolean
}) {
  const update = (i: number, patch: Partial<ScheduleBlock>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const add = () =>
    onChange([...blocks, { weekday: 1, start: '09:00', end: '10:00', label: '', location: null, category: showCategory ? 'personal' : 'school' }])

  return (
    <div className="flex flex-col gap-2">
      {blocks.length === 0 && <p className="text-slate-600">No {noun}s yet.</p>}
      <ul className="flex flex-col gap-2">
        {blocks.map((b, i) => {
          const problem = blockProblem(b)
          return (
            <li key={i} className="flex flex-col gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200" aria-label={`${noun} ${i + 1}`}>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input aria-label="Name" placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} name`} className={input} value={b.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={120} />
                <button type="button" aria-label={`Remove ${b.label || noun}`} onClick={() => onChange(blocks.filter((_, j) => j !== i))} className="flex size-11 items-center justify-center rounded-lg text-red-700 hover:bg-red-50">
                  <Trash2 aria-hidden className="size-5" />
                </button>
              </div>
              <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2">
                <select aria-label="Day" className={input} value={b.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>
                  {WEEKDAY_NAMES.map((d, n) => (
                    <option key={d} value={n}>
                      {d}
                    </option>
                  ))}
                </select>
                <input aria-label="Starts" type="time" className={input} value={b.start} onChange={(e) => update(i, { start: e.target.value })} />
                <input aria-label="Ends" type="time" className={input} value={b.end} onChange={(e) => update(i, { end: e.target.value })} />
              </div>
              <div className={showCategory ? 'grid grid-cols-[1fr_auto] gap-2' : ''}>
                <input aria-label="Location" placeholder="Location (optional)" className={input} value={b.location ?? ''} onChange={(e) => update(i, { location: e.target.value || null })} maxLength={120} />
                {showCategory && (
                  <select aria-label="Type" className={input} value={b.category} onChange={(e) => update(i, { category: e.target.value as ScheduleBlock['category'] })}>
                    <option value="school">School / involvement</option>
                    <option value="personal">Personal</option>
                  </select>
                )}
              </div>
              {problem && <p className="text-sm font-medium text-red-700">{problem}</p>}
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={add} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 font-semibold text-brand-700">
        <Plus aria-hidden className="size-5" /> Add {noun}
      </button>
    </div>
  )
}
