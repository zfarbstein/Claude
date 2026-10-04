import { formatDistanceToNow } from 'date-fns'
import { BellOff } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../components/AppLayout'
import { Alert } from '../components/ui'
import { cx } from '../lib/cx'
import { useInbox, useMarkInboxRead } from './api'

/** Everything the chapter sent you, newest first. Opening the page marks it all read. */
export default function InboxPage() {
  const inbox = useInbox()
  const markRead = useMarkInboxRead()
  const navigate = useNavigate()
  const hasUnread = !!inbox.data?.some((n) => !n.read_at)
  const { mutate } = markRead

  useEffect(() => {
    if (hasUnread) mutate()
  }, [hasUnread, mutate])

  return (
    <div>
      <PageHeader title="Notifications" />
      <main className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-4">
        {inbox.isError && <Alert>{inbox.error.message}</Alert>}
        {inbox.isPending && <p className="text-slate-600">Loading…</p>}
        {inbox.data?.length === 0 && (
          <p className="flex flex-col items-center gap-2 py-12 text-center text-slate-600">
            <BellOff aria-hidden className="size-8" /> No notifications yet.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {inbox.data?.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void navigate(n.url || '/')}
                className={cx(
                  'flex w-full flex-col gap-0.5 rounded-xl p-3 text-left ring-1',
                  n.read_at ? 'bg-white ring-slate-200' : 'bg-brand-50 ring-brand-100',
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-bold">{n.title}</span>
                  <span className="shrink-0 text-xs text-slate-600">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                </span>
                {n.body && <span className="text-sm text-slate-700">{n.body}</span>}
                {!n.read_at && <span className="sr-only">Unread</span>}
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
