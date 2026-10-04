import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleX } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { PageHeader } from '../components/AppLayout'
import { Spinner } from '../components/ui'
import { checkIn, type CheckinResult } from './api'

/** Where a scanned QR code lands: /checkin?e=<event>&c=<code>. */
export default function CheckInPage() {
  const [params] = useSearchParams()
  // The manual-code screen passes its result along instead of checking in twice.
  const passed = (useLocation().state as { result?: CheckinResult } | null)?.result
  const eventId = passed ? 'passed' : (params.get('e') ?? '')
  const code = passed ? 'passed' : (params.get('c') ?? '')
  const query = useQuery({
    queryKey: ['checkin', eventId, code],
    enabled: !passed && !!eventId && !!code,
    queryFn: () => checkIn(eventId, code),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  })
  const result = passed ? { data: passed, isPending: false, isError: false as const, error: null } : query

  return (
    <div>
      <PageHeader title="Check in" />
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-10 text-center" aria-live="polite">
        {(!eventId || !code) && <p className="text-slate-700">That check-in link is incomplete. Scan the code at the door again.</p>}
        {result.isPending && eventId && code && <Spinner className="size-10 text-brand-700" />}
        {result.isError && <p className="font-semibold text-red-800">{result.error.message}</p>}
        {result.data?.ok && (
          <>
            <CircleCheck aria-hidden className="size-20 text-green-700" />
            <h2 className="text-2xl font-bold">You&rsquo;re checked in</h2>
            {result.data.title && <p className="text-lg text-slate-700">{result.data.title}</p>}
          </>
        )}
        {result.data && !result.data.ok && (
          <>
            <CircleX aria-hidden className="size-20 text-red-700" />
            <h2 className="text-2xl font-bold">Not checked in</h2>
            {result.data.title && <p className="text-lg text-slate-700">{result.data.title}</p>}
            <p className="text-slate-800">{result.data.message}</p>
          </>
        )}
        {(result.data || result.isError || !eventId) && (
          <div className="flex w-full flex-col gap-2 pt-4">
            {!result.data?.ok && (
              <Link to="/scan" className="flex min-h-12 items-center justify-center rounded-xl bg-brand-700 font-semibold text-white">
                Scan again
              </Link>
            )}
            <Link to="/" className="flex min-h-12 items-center justify-center rounded-xl bg-white font-semibold text-slate-900 ring-1 ring-slate-300">
              Back to the calendar
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
