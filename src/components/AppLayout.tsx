import { CalendarDays, ShieldCheck, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { isAdmin } from '../lib/permissions'
import { cx } from '../lib/cx'

export function AppLayout() {
  const { member } = useAuth()
  const items = [
    { to: '/', label: 'Calendar', icon: CalendarDays, end: true },
    ...(isAdmin(member) ? [{ to: '/admin/members', label: 'Admin', icon: ShieldCheck, end: false }] : []),
    { to: '/me', label: 'Me', icon: UserRound, end: false },
  ]
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-safe">
        <ul className="mx-auto flex max-w-lg">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold',
                    isActive ? 'text-brand-700' : 'text-slate-600',
                  )
                }
              >
                <Icon aria-hidden className="size-6" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-safe backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <h1 className="text-xl font-bold">{title}</h1>
        {actions}
      </div>
    </header>
  )
}
