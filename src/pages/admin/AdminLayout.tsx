import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet } from 'react-router'
import { PageHeader } from '../../components/AppLayout'
import { cx } from '../../lib/cx'
import { cal, supabase } from '../../lib/supabase'

const TABS = [
  { to: '/admin/members', label: 'Members', badge: 'members' },
  { to: '/admin/schedules', label: 'Schedules' },
  { to: '/admin/attendance', label: 'Attendance' },
  { to: '/admin/excuses', label: 'Excuses', badge: 'excuses' },
  { to: '/admin/notify', label: 'Notify' },
  { to: '/admin/semester', label: 'Semester' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/export', label: 'Export' },
  { to: '/admin/apps', label: 'Apps' },
] as const

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

export default function AdminLayout() {
  const pending = useQuery({
    queryKey: ['admin', 'badges'],
    refetchInterval: 60_000,
    queryFn: async () => ({
      members: await count(supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('active', true)),
      excuses: await count(cal.from('excuses').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    }),
  })
  return (
    <div>
      <PageHeader title="Admin" />
      <nav aria-label="Admin sections" className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
        <ul className="mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
          {TABS.map((t) => {
            const n = 'badge' in t ? (pending.data?.[t.badge] ?? 0) : 0
            return (
              <li key={t.to} className="shrink-0">
                <NavLink
                  to={t.to}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ring-1',
                      isActive ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-800 ring-slate-300',
                    )
                  }
                >
                  {t.label}
                  {n > 0 && (
                    <span className="rounded-full bg-red-700 px-1.5 text-xs leading-5 text-white" aria-label={`${n} waiting`}>
                      {n}
                    </span>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
