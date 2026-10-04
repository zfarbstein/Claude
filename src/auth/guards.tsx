import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { FullScreenMessage, Spinner } from '../components/ui'
import { isActiveMember, isAdmin } from '../lib/permissions'
import { useAuth } from './AuthProvider'

export function FullScreenLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <Spinner className="size-8 text-brand-700" />
    </div>
  )
}

export function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading, error, refreshMember } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoading />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (error)
    return (
      <FullScreenMessage title="Can't load your account" action={{ label: 'Try again', onClick: () => void refreshMember() }}>
        Check your connection and try again.
      </FullScreenMessage>
    )
  return children
}

/** Approved, active members only. Everyone else lands on the pending screen. */
export function RequireApproved({ children }: { children: ReactNode }) {
  const { member } = useAuth()
  if (!isActiveMember(member)) return <Navigate to="/pending" replace />
  return children
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { member } = useAuth()
  if (!isAdmin(member)) return <Navigate to="/" replace />
  return children
}

/** Login / sign-up pages: bounce signed-in users into the app. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoading />
  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from.startsWith('/') ? from : '/'} replace />
  }
  return children
}
