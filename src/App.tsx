import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { FullScreenLoading, PublicOnly, RequireAdmin, RequireApproved, RequireSession } from './auth/guards'
import { AppLayout } from './components/AppLayout'
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
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true },
  },
})

export default function App() {
  useEffect(() => {
    document.title = env.appName
  }, [])

  return (
    <BrowserRouter>
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
                <Route
                  element={
                    <RequireSession>
                      <RequireApproved>
                        <AppLayout />
                      </RequireApproved>
                    </RequireSession>
                  }
                >
                  <Route index element={<CalendarPage />} />
                  <Route path="me" element={<MePage />} />
                  <Route path="admin/members" element={<RequireAdmin><AdminMembers /></RequireAdmin>} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            <InstallPrompt />
            <UpdatePrompt />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
