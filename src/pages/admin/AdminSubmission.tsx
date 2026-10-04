import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../components/AppLayout'
import { Alert, Badge } from '../../components/ui'
import { openPrivateFile } from '../../excuses/api'
import { unwrap } from '../../lib/query'
import { cal, supabase } from '../../lib/supabase'
import { inChapterTz } from '../../lib/time'
import type { ScheduleUpload } from '../../lib/types'
import { useCurrentSemester } from '../../schedule/api'

const KIND_LABELS: Record<string, string> = { ai: 'Typed / photos (read by Claude)', ics_file: 'Calendar file', ics_url: 'Calendar link', canvas: 'Canvas feed' }
const when = (iso: string | null) => (iso ? format(inChapterTz(iso), 'MMM d, h:mm a') : '—')

/** Admins: what a member actually submitted (photos, typed text, feeds, what was read from them). */
export default function AdminSubmission() {
  const { memberId = '' } = useParams()
  const semester = useCurrentSemester()
  const data = useQuery({
    queryKey: ['admin', 'submission', memberId, semester.data?.id],
    enabled: !!semester.data,
    queryFn: async () => {
      const [member, submission, uploads] = await Promise.all([
        supabase.from('members').select('id,name,email').eq('id', memberId).maybeSingle(),
        cal.from('schedule_submissions').select('*').eq('member_id', memberId).eq('semester_id', semester.data!.id).maybeSingle(),
        cal.from('schedule_uploads').select('*').eq('member_id', memberId).eq('semester_id', semester.data!.id).order('created_at', { ascending: false }),
      ])
      return { member: unwrap(member), submission: unwrap(submission), uploads: unwrap(uploads) }
    },
  })
  const s = data.data?.submission

  return (
    <div>
      <PageHeader title={data.data?.member?.name ?? 'Submission'} back="/admin/schedules" />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
        {data.isError && <Alert>{data.error.message}</Alert>}
        {data.data && (
          <>
            <section className="flex flex-col gap-1 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label="Steps">
              <p>Classes: {when(s?.classes_done_at ?? null)}</p>
              <p>Exams: {when(s?.exams_done_at ?? null)}</p>
              <p>Weekly obligations: {when(s?.obligations_done_at ?? null)}</p>
              {s?.canvas_feed_url && (
                <p className="text-sm break-all text-slate-700">
                  Canvas feed: {s.canvas_feed_url} · last synced {when(s.canvas_synced_at)}
                  {s.canvas_sync_error && <span className="block font-semibold text-red-800">Sync error: {s.canvas_sync_error}</span>}
                </p>
              )}
              <Link to={`/members/${memberId}`} className="mt-2 font-semibold text-brand-700 underline">
                See their saved schedule
              </Link>
            </section>
            <h2 className="text-lg font-bold">Uploads ({data.data.uploads.length})</h2>
            {data.data.uploads.length === 0 && <p className="text-slate-600">Nothing uploaded. They typed everything in by hand.</p>}
            <ul className="flex flex-col gap-3">
              {data.data.uploads.map((u) => (
                <li key={u.id}>
                  <UploadCard upload={u} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  )
}

function UploadCard({ upload }: { upload: ScheduleUpload }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="bg-brand-50 text-brand-900 capitalize">{upload.step}</Badge>
        <Badge>{KIND_LABELS[upload.kind] ?? upload.kind}</Badge>
        <span className="text-sm text-slate-600">{when(upload.created_at)}</span>
      </div>
      {upload.text_content && <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-sm whitespace-pre-wrap">{upload.text_content}</pre>}
      {upload.source_url && <p className="text-sm break-all text-slate-700">{upload.source_url}</p>}
      {upload.storage_paths.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {upload.storage_paths.map((p) => (
            <PrivateImage key={p} path={p} />
          ))}
        </div>
      )}
      {upload.parsed !== null && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">What was read</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(upload.parsed, null, 2)}</pre>
        </details>
      )}
    </article>
  )
}

function PrivateImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    let made: string | null = null
    openPrivateFile('schedule-uploads', path)
      .then((u) => {
        made = u
        if (live) setUrl(u)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [path])
  if (failed) return <p className="text-sm text-slate-600">Photo not available.</p>
  if (!url) return <div className="aspect-[3/4] animate-pulse rounded-lg bg-slate-100" />
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Uploaded schedule" className="w-full rounded-lg ring-1 ring-slate-200" />
    </a>
  )
}
