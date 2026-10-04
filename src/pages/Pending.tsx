import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { AuthLayout } from '../auth/AuthLayout'
import { useAuth } from '../auth/AuthProvider'
import { Button } from '../components/ui'
import { isActiveMember } from '../lib/permissions'

export default function Pending() {
  const { member, refreshMember, signOut } = useAuth()
  const [checking, setChecking] = useState(false)
  const pending = member?.status === 'pending' && member.active

  // Pick up an approval without making the member refresh.
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(() => void refreshMember(), 30_000)
    return () => clearInterval(timer)
  }, [pending, refreshMember])

  if (isActiveMember(member)) return <Navigate to="/" replace />

  const check = async () => {
    setChecking(true)
    await refreshMember()
    setChecking(false)
  }

  const copy = !member
    ? { title: 'Account not found', body: 'We couldn’t find your member record. Contact an officer.' }
    : member.status === 'rejected'
      ? { title: 'Account not approved', body: 'Your account wasn’t approved. If you think that’s a mistake, talk to an officer.' }
      : !member.active
        ? { title: 'Account inactive', body: 'Your account is marked inactive. Talk to an officer if you need access again.' }
        : {
            title: 'Waiting for approval',
            body: `Thanks${member.name ? `, ${member.name.split(' ')[0]}` : ''}! An officer needs to approve your account before you can see the calendar. This page updates on its own.`,
          }

  return (
    <AuthLayout title={copy.title}>
      {pending && <Clock aria-hidden className="mb-3 size-10 text-brand-700" />}
      <p className="text-slate-800">{copy.body}</p>
      <p className="mt-2 text-sm text-slate-600">Signed in as {member?.email}</p>
      <div className="mt-6 flex flex-col gap-3">
        {pending && (
          <Button block busy={checking} onClick={() => void check()}>
            Check again
          </Button>
        )}
        <Button block variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </AuthLayout>
  )
}
