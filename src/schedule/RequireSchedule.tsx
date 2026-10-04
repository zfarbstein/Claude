import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { FullScreenLoading } from '../auth/guards'
import { FullScreenMessage } from '../components/ui'
import { useScheduleStatus } from './api'

/** Members must finish their schedule for the current semester before using the calendar. */
export function RequireSchedule({ children }: { children: ReactNode }) {
  const status = useScheduleStatus()
  if (status.loading) return <FullScreenLoading />
  if (status.error) {
    return (
      <FullScreenMessage title="Can't load your schedule" action={{ label: 'Try again', onClick: () => window.location.reload() }}>
        Check your connection and try again.
      </FullScreenMessage>
    )
  }
  if (status.needsSetup) return <Navigate to="/setup" replace />
  return children
}
