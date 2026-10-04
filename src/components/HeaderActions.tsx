import { Bell, LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useHubApps, useUnreadCount } from '../notifications/api'
import { Sheet } from './Sheet'

/** Bell (in-app notifications) and the hub "Apps" menu, shown in every page header. */
export function HeaderActions() {
  const unread = useUnreadCount().data ?? 0
  return (
    <div className="flex shrink-0 items-center">
      <Link
        to="/inbox"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex size-11 items-center justify-center rounded-full text-slate-800 hover:bg-slate-100"
      >
        <Bell aria-hidden className="size-6" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-[11px] leading-5 font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
      <AppsMenu />
    </div>
  )
}

function AppsMenu() {
  const apps = useHubApps().data ?? []
  const [open, setOpen] = useState(false)
  if (apps.length < 2) return null
  const here = (url: string) => {
    try {
      return new URL(url, window.location.href).origin === window.location.origin
    } catch {
      return false
    }
  }
  return (
    <>
      <button type="button" aria-label="Apps" onClick={() => setOpen(true)} className="flex size-11 items-center justify-center rounded-full text-slate-800 hover:bg-slate-100">
        <LayoutGrid aria-hidden className="size-6" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Chapter apps">
        <ul className="grid grid-cols-3 gap-3">
          {apps.map((app) => {
            const current = here(app.url)
            const tileClass =
              'flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-50 p-2 text-center text-sm font-semibold ring-1 ring-slate-200 aria-[current=page]:ring-2 aria-[current=page]:ring-brand-700'
            const content = (
              <>
                {/^https?:\/\//.test(app.icon) ? (
                  <img src={app.icon} alt="" className="size-9 rounded-lg object-cover" />
                ) : (
                  <span aria-hidden className="text-3xl leading-none">
                    {app.icon}
                  </span>
                )}
                {app.name}
              </>
            )
            return (
              <li key={app.id}>
                {current ? (
                  <Link to="/" aria-current="page" onClick={() => setOpen(false)} className={tileClass}>
                    {content}
                  </Link>
                ) : (
                  // The in-Claude demo can't leave its frame, so other apps open in a new tab there.
                  <a href={app.url} {...(import.meta.env.VITE_DEMO ? { target: '_blank', rel: 'noreferrer' } : {})} className={tileClass}>
                    {content}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      </Sheet>
    </>
  )
}
