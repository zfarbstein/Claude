import { formatDistanceToNow } from 'date-fns'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../../components/Toast'
import { Alert, Badge, Button, TextField } from '../../components/ui'
import { cx } from '../../lib/cx'
import { formatLongDay, formatTimeRange } from '../../lib/time'
import { openPrivateFile, useExcuseQueue, useReviewExcuse, type QueueItem } from '../../excuses/api'

type Tab = 'pending' | 'reviewed'

export default function AdminExcuses() {
  const queue = useExcuseQueue()
  const [tab, setTab] = useState<Tab>('pending')
  const all = queue.data ?? []
  const pending = all.filter((x) => x.status === 'pending')
  const reviewed = all.filter((x) => x.status !== 'pending')
  const list = tab === 'pending' ? pending : reviewed

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
      <div role="tablist" aria-label="Excuses" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ['pending', `Waiting (${pending.length})`],
            ['reviewed', `Reviewed (${reviewed.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx('min-h-11 rounded-lg text-sm font-bold', tab === key ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
          >
            {label}
          </button>
        ))}
      </div>
      {queue.isError && <Alert>{queue.error.message}</Alert>}
      {queue.isPending && <p className="text-slate-600">Loading…</p>}
      {queue.data && list.length === 0 && <p className="text-slate-600">{tab === 'pending' ? 'No excuses waiting.' : 'Nothing reviewed yet.'}</p>}
      <ul className="flex flex-col gap-3">
        {list.map((x) => (
          <li key={x.id}>
            <ExcuseCard item={x} />
          </li>
        ))}
      </ul>
    </main>
  )
}

function ExcuseCard({ item }: { item: QueueItem }) {
  const toast = useToast()
  const review = useReviewExcuse()
  const [note, setNote] = useState(item.review_note ?? '')
  const [opening, setOpening] = useState(false)

  const decide = (approve: boolean) =>
    review.mutate(
      { id: item.id, approve, note },
      {
        onSuccess: () => toast(approve ? `Approved: ${item.member?.name ?? 'member'} is excused` : 'Excuse denied'),
        onError: (e) => toast(e.message, 'error'),
      },
    )

  const openAttachment = async () => {
    if (!item.attachment_path) return
    setOpening(true)
    try {
      const url = await openPrivateFile('excuse-attachments', item.attachment_path)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t open the file', 'error')
    } finally {
      setOpening(false)
    }
  }

  return (
    <article className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label={`Excuse from ${item.member?.name ?? 'member'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{item.member?.name ?? 'Former member'}</p>
          <p className="text-sm text-slate-700">
            {item.event ? `${item.event.title} · ${formatLongDay(item.event.starts_at)}, ${formatTimeRange(item.event)}` : 'Deleted event'}
          </p>
        </div>
        {item.status !== 'pending' && (
          <Badge className={item.status === 'approved' ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}>
            {item.status === 'approved' ? 'Approved' : 'Denied'}
          </Badge>
        )}
      </div>
      <p className="whitespace-pre-wrap text-slate-900">{item.reason}</p>
      <p className="text-xs text-slate-600">Sent {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</p>
      {item.attachment_path && (
        <Button variant="secondary" busy={opening} onClick={() => void openAttachment()}>
          <Paperclip aria-hidden className="size-5" /> View proof
        </Button>
      )}
      <TextField label="Note to the member (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      <div className="grid grid-cols-2 gap-2">
        <Button busy={review.isPending} onClick={() => decide(true)} disabled={item.status === 'approved'}>
          Approve
        </Button>
        <Button variant="secondary" className="text-red-700" busy={review.isPending} onClick={() => decide(false)} disabled={item.status === 'denied'}>
          Deny
        </Button>
      </div>
    </article>
  )
}
