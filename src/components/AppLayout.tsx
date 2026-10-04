import { ArrowLeft, CalendarDays, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { canSeeChapter, isAdmin } from '../lib/permissions'
import { cx } from '../lib/cx'
import { resyncPush } from '../notifications/push'
import { HeaderActions } from './HeaderActions'

export function AppLayout() {
  const { member } = useAuth()
  const memberId = member?.id
  useEffect(() => {
    if (memberId) void resyncPush().catch(() => undefined)
  }, [memberId])
  const items = [
    { to: '/', label: 'Calendar', icon: CalendarDays, end: true },
    ...(canSeeChapter(member) ? [{ to: '/members', label: 'Members', icon: UsersRound, end: false }] : []),
    ...(isAdmin(member) ? [{ to: '/admin', label: 'Admin', icon: ShieldCheck, end: false }] : []),
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

export function PageHeader({ title, actions, back }: { title: string; actions?: ReactNode; back?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-safe backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-2 px-4">
        {back && (
          <Link to={back} aria-label="Back" className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100">
            <ArrowLeft aria-hidden className="size-6" />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{title}</h1>
        {actions}
        <HeaderActions />
      </div>
    </header>
  )
}
