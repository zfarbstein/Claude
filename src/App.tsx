import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { FullScreenLoading, PublicOnly, RequireAdmin, RequireApproved, RequireBrother, RequireSession } from './auth/guards'
import { AppLayout } from './components/AppLayout'
import { RequireSchedule } from './schedule/RequireSchedule'
import { InstallPrompt } from './components/InstallPrompt'
import { ToastProvider } from './components/Toast'
import { UpdatePrompt } from './components/UpdatePrompt'
import { env } from './lib/env'
import AuthCallback from './pages/AuthCallback'
import AuthConfirm from './pages/AuthConfirm'
import CalendarPage from './pages/CalendarPage'
import ForgotPassword from './pages/ForgotPassword'
import Login from './pages/Login'
import Pending from './pages/Pending'
import ResetPassword from './pages/ResetPassword'
import Signup from './pages/Signup'

const MePage = lazy(() => import('./pages/MePage'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers'))
const AdminSemester = lazy(() => import('./pages/admin/AdminSemester'))
const SetupPage = lazy(() => import('./schedule/SetupPage'))
const MySchedulePage = lazy(() => import('./schedule/MySchedulePage'))
const MembersPage = lazy(() => import('./members/MembersPage'))
const MemberPage = lazy(() => import('./members/MemberPage'))
const InboxPage = lazy(() => import('./notifications/InboxPage'))
const ExcusePage = lazy(() => import('./excuses/ExcusePage'))
const ScanPage = lazy(() => import('./attendance/ScanPage'))
const CheckInPage = lazy(() => import('./attendance/CheckInPage'))
const RosterPage = lazy(() => import('./attendance/RosterPage'))
const CheckinCodePage = lazy(() => import('./attendance/CheckinCodePage'))
const AdminSchedules = lazy(() => import('./pages/admin/AdminSchedules'))
const AdminSubmission = lazy(() => import('./pages/admin/AdminSubmission'))
const AdminAttendance = lazy(() => import('./pages/admin/AdminAttendance'))
const AdminExcuses = lazy(() => import('./pages/admin/AdminExcuses'))
const AdminNotify = lazy(() => import('./pages/admin/AdminNotify'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminExport = lazy(() => import('./pages/admin/AdminExport'))
const AdminApps = lazy(() => import('./pages/admin/AdminApps'))

// The in-Claude demo (npm run build:demo) runs in a frame with no real URL, so it routes in memory.
const DEMO = !!import.meta.env.VITE_DEMO
const Router = DEMO ? MemoryRouter : BrowserRouter
const DemoPanel = DEMO ? lazy(() => import('./demo/DemoPanel')) : null

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true },
  },
})

/** Drops cached queries when a different person signs in, so nobody sees the last user's data. */
function ClearCacheOnUserChange() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const userId = session?.user.id ?? null
  const previous = useRef(userId)
  useEffect(() => {
    if (previous.current !== userId) queryClient.clear()
    previous.current = userId
  }, [userId, queryClient])
  return null
}

export default function App() {
  useEffect(() => {
    document.title = env.appName
  }, [])

  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<FullScreenLoading />}>
              <Routes>
                <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/auth/confirm" element={<AuthConfirm />} />
                <Route path="/pending" element={<RequireSession><Pending /></RequireSession>} />
                <Route path="/setup" element={<RequireSession><RequireApproved><SetupPage /></RequireApproved></RequireSession>} />
                <Route
                  path="/attendance/:eventId/code"
                  element={<RequireSession><RequireApproved><RequireAdmin><CheckinCodePage /></RequireAdmin></RequireApproved></RequireSession>}
                />
                <Route
                  element={
                    <RequireSession>
                      <RequireApproved>
                        <AppLayout />
                      </RequireApproved>
                    </RequireSession>
                  }
                >
                  <Route index element={<RequireSchedule><CalendarPage /></RequireSchedule>} />
                  <Route path="me" element={<MePage />} />
                  <Route path="me/schedule" element={<MySchedulePage />} />
                  <Route path="inbox" element={<InboxPage />} />
                  <Route path="excuse" element={<ExcusePage />} />
                  <Route path="scan" element={<ScanPage />} />
                  <Route path="checkin" element={<CheckInPage />} />
                  <Route path="members" element={<RequireBrother><MembersPage /></RequireBrother>} />
                  <Route path="members/:id" element={<RequireBrother><MemberPage /></RequireBrother>} />
                  <Route path="attendance/:eventId" element={<RequireAdmin><RosterPage /></RequireAdmin>} />
                  <Route path="admin/schedules/:memberId" element={<RequireAdmin><AdminSubmission /></RequireAdmin>} />
                  <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                    <Route index element={<Navigate to="members" replace />} />
                    <Route path="members" element={<AdminMembers />} />
                    <Route path="schedules" element={<AdminSchedules />} />
                    <Route path="attendance" element={<AdminAttendance />} />
                    <Route path="excuses" element={<AdminExcuses />} />
                    <Route path="notify" element={<AdminNotify />} />
                    <Route path="semester" element={<AdminSemester />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="export" element={<AdminExport />} />
                    <Route path="apps" element={<AdminApps />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            <ClearCacheOnUserChange />
            <InstallPrompt />
            <UpdatePrompt />
            {DemoPanel && (
              <Suspense fallback={null}>
                <DemoPanel />
              </Suspense>
            )}
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </Router>
  )
}
