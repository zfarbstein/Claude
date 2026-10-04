import { ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/AppLayout'
import { Alert, Badge } from '../components/ui'
import { cx } from '../lib/cx'
import { ACCESS_LABELS, accessOf, isAdmin } from '../lib/permissions'
import { useCurrentSemester } from '../schedule/api'
import { useDirectory, useSubmissionMap } from './api'

type Filter = 'all' | 'brothers' | 'pledges'

export default function MembersPage() {
  const { member } = useAuth()
  const admin = isAdmin(member)
  const directory = useDirectory()
  const semester = useCurrentSemester()
  const submitted = useSubmissionMap(semester.data?.id, admin)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const q = query.trim().toLowerCase()
  const list = (directory.data ?? []).filter(
    (m) =>
      (filter === 'all' || (filter === 'brothers' ? m.member_type === 'brother' : m.member_type === 'associate')) &&
      (!q || m.name.toLowerCase().includes(q) || (m.pledge_class ?? '').toLowerCase().includes(q) || (admin && m.email.toLowerCase().includes(q))),
  )

  return (
    <div>
      <PageHeader title="Members" />
      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
        <label className="relative block">
          <span className="sr-only">Search members</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or pledge class"
            className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-10 text-base"
          />
        </label>
        <div role="group" aria-label="Show" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {(['all', 'brothers', 'pledges'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cx('min-h-10 rounded-lg text-sm font-bold capitalize', filter === f ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
            >
              {f}
            </button>
          ))}
        </div>

        {directory.isError && <Alert>{directory.error.message}</Alert>}
        {directory.isPending && <p className="text-slate-600">Loading…</p>}
        {directory.data && <p className="text-sm text-slate-600">{list.length} {list.length === 1 ? 'member' : 'members'}</p>}

        <ul className="flex flex-col divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          {list.map((m) => {
            const access = accessOf(m)
            const missing = admin && submitted.data && !submitted.data.get(m.id)
            return (
              <li key={m.id}>
                <Link to={`/members/${m.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{m.name || m.email}</span>
                    {m.pledge_class && <span className="block text-sm text-slate-600">{m.pledge_class}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {access !== 'brother' && (
                      <Badge className={access === 'admin' ? 'bg-brand-50 text-brand-900' : undefined}>{ACCESS_LABELS[access]}</Badge>
                    )}
                    {missing && <Badge className="bg-amber-100 text-amber-900">No schedule</Badge>}
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-slate-400" />
                </Link>
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
