import { CalendarDays } from 'lucide-react'
import type { ReactNode } from 'react'
import { env } from '../lib/env'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-10">
      <div className="mb-6 flex flex-col items-center gap-2">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-700 text-white shadow">
          <CalendarDays aria-hidden className="size-8" />
        </span>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">{env.appName}</p>
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-700">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}
