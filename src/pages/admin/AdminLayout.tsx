import { NavLink, Outlet } from 'react-router'
import { PageHeader } from '../../components/AppLayout'
import { cx } from '../../lib/cx'

const TABS = [
  { to: '/admin/members', label: 'Members' },
  { to: '/admin/semester', label: 'Semester' },
]

export default function AdminLayout() {
  return (
    <div>
      <PageHeader title="Admin" />
      <nav aria-label="Admin sections" className="mx-auto max-w-3xl px-4 pt-3">
        <ul className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  cx('flex min-h-11 items-center justify-center rounded-lg text-sm font-bold', isActive ? 'bg-white text-brand-700 shadow' : 'text-slate-700')
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
