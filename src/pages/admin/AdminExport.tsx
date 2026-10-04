import { FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { buildWorkbook, exportFilename } from '../../admin/exportWorkbook'
import { useToast } from '../../components/Toast'
import { Alert, Button } from '../../components/ui'
import { fetchAll, unwrap } from '../../lib/query'
import { saveFile } from '../../lib/saveFile'
import { cal, supabase } from '../../lib/supabase'
import { dayKey } from '../../lib/time'
import type { AttendanceReport } from '../../lib/types'
import { useCurrentSemester } from '../../schedule/api'

const SHEETS = [
  ['Members', 'Everyone, with access level, pledge class and whether they submitted a schedule'],
  ['Weekly schedules', 'Every class, by member and day'],
  ['Exams', 'Every exam with its date and time'],
  ['Obligations', 'Weekly and one-off obligations (jobs, practices, meetings)'],
  ['Attendance', 'Members × events with P / A / E and each member’s attendance %'],
  ['Excuses', 'Every excuse with its status and the secretary’s note'],
]

/** One-tap Excel export of the current semester. */
export default function AdminExport() {
  const toast = useToast()
  const semester = useCurrentSemester()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    const sem = semester.data
    setBusy(true)
    setError(null)
    try {
      const [members, submissions, blocks, items, report, excuses] = await Promise.all([
        fetchAll((a, b) => supabase.from('members').select('*').neq('status', 'rejected').order('name').range(a, b)),
        sem ? fetchAll((a, b) => cal.from('schedule_submissions').select('*').eq('semester_id', sem.id).range(a, b)) : [],
        sem ? fetchAll((a, b) => cal.from('weekly_blocks').select('*').eq('semester_id', sem.id).order('id').range(a, b)) : [],
        sem ? fetchAll((a, b) => cal.from('dated_items').select('*').eq('semester_id', sem.id).order('id').range(a, b)) : [],
        sem
          ? cal.rpc('attendance_report', { p_from: sem.starts_on, p_to: dayKey(Date.now()) < sem.ends_on ? dayKey(Date.now()) : sem.ends_on }).then(unwrap)
          : { events: [], members: [], cells: [] },
        fetchAll((a, b) => cal.from('excuses').select('*').order('created_at').range(a, b)),
      ])
      const eventIds = [...new Set(excuses.map((x) => x.event_id))]
      const events = eventIds.length ? unwrap(await cal.from('events').select('id,title,starts_at').in('id', eventIds)) : []
      const blob = await buildWorkbook({
        semester: sem ?? null,
        members,
        submissions,
        blocks,
        items,
        report: report as unknown as AttendanceReport,
        excuses: sem ? excuses.filter((x) => events.some((e) => e.id === x.event_id && e.starts_at.slice(0, 10) >= sem.starts_on)) : excuses,
        eventTitles: new Map(events.map((e) => [e.id, e])),
      })
      const saved = await saveFile(blob, exportFilename(sem?.name))
      if (saved) toast('Export ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="export-title">
        <h2 id="export-title" className="flex items-center gap-2 text-lg font-bold">
          <FileSpreadsheet aria-hidden className="size-5 text-green-700" /> Excel export
        </h2>
        <p className="text-slate-700">{semester.data ? `${semester.data.name}, one workbook with six sheets:` : 'One workbook with six sheets:'}</p>
        <ul className="flex flex-col gap-1.5">
          {SHEETS.map(([title, text]) => (
            <li key={title} className="text-sm">
              <strong>{title}</strong> <span className="text-slate-700">— {text}</span>
            </li>
          ))}
        </ul>
        {error && <Alert>{error}</Alert>}
        <Button busy={busy} onClick={() => void download()}>
          Download .xlsx
        </Button>
        <p className="text-sm text-slate-600">It contains members&rsquo; schedules and emails. Keep it inside exec.</p>
      </section>
    </main>
  )
}
